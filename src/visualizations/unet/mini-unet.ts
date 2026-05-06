// Mini U-Net inference in pure TS — random He-init weights, instance norm.
// Output is "noise with structure"; goal is to SEE feature maps shrink/grow.

export interface Tensor {
  c: number;
  h: number;
  w: number;
  data: Float32Array;
}

export interface Stage {
  label: string;
  tensor: Tensor;
}

function makeTensor(c: number, h: number, w: number): Tensor {
  return { c, h, w, data: new Float32Array(c * h * w) };
}

function randn() {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function heInit(outC: number, inC: number, k: number) {
  const std = Math.sqrt(2 / (inC * k * k));
  const w = new Float32Array(outC * inC * k * k);
  for (let i = 0; i < w.length; i++) w[i] = randn() * std;
  return w;
}

function conv2d(x: Tensor, weight: Float32Array, outC: number, k = 3): Tensor {
  const { c: inC, h, w } = x;
  const out = makeTensor(outC, h, w);
  const half = (k - 1) >> 1;
  const xd = x.data;
  const od = out.data;
  for (let oc = 0; oc < outC; oc++) {
    for (let oy = 0; oy < h; oy++) {
      for (let ox = 0; ox < w; ox++) {
        let s = 0;
        for (let ic = 0; ic < inC; ic++) {
          const wBase = (oc * inC + ic) * k * k;
          const xBase = ic * h * w;
          for (let ky = 0; ky < k; ky++) {
            const iy = oy + ky - half;
            if (iy < 0 || iy >= h) continue;
            for (let kx = 0; kx < k; kx++) {
              const ix = ox + kx - half;
              if (ix < 0 || ix >= w) continue;
              s += xd[xBase + iy * w + ix] * weight[wBase + ky * k + kx];
            }
          }
        }
        od[oc * h * w + oy * w + ox] = s;
      }
    }
  }
  return out;
}

function relu(x: Tensor) {
  const d = x.data;
  for (let i = 0; i < d.length; i++) if (d[i] < 0) d[i] = 0;
  return x;
}

function instanceNorm(x: Tensor) {
  const { c, h, w } = x;
  const sz = h * w;
  const d = x.data;
  for (let ic = 0; ic < c; ic++) {
    const base = ic * sz;
    let sum = 0;
    for (let i = 0; i < sz; i++) sum += d[base + i];
    const mean = sum / sz;
    let varsum = 0;
    for (let i = 0; i < sz; i++) {
      const v = d[base + i] - mean;
      varsum += v * v;
    }
    const std = Math.sqrt(varsum / sz + 1e-5);
    for (let i = 0; i < sz; i++) d[base + i] = (d[base + i] - mean) / std;
  }
  return x;
}

function maxpool2d(x: Tensor): Tensor {
  const { c, h, w } = x;
  const oh = h >> 1;
  const ow = w >> 1;
  const out = makeTensor(c, oh, ow);
  const xd = x.data,
    od = out.data;
  for (let ic = 0; ic < c; ic++) {
    for (let y = 0; y < oh; y++) {
      for (let xv = 0; xv < ow; xv++) {
        let m = -Infinity;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const v = xd[ic * h * w + (y * 2 + dy) * w + (xv * 2 + dx)];
            if (v > m) m = v;
          }
        }
        od[ic * oh * ow + y * ow + xv] = m;
      }
    }
  }
  return out;
}

function upsample2x(x: Tensor): Tensor {
  const { c, h, w } = x;
  const oh = h * 2,
    ow = w * 2;
  const out = makeTensor(c, oh, ow);
  const xd = x.data,
    od = out.data;
  for (let ic = 0; ic < c; ic++) {
    const base = ic * h * w;
    const obase = ic * oh * ow;
    for (let y = 0; y < oh; y++) {
      const sy = y / 2;
      const y0 = Math.min(Math.floor(sy), h - 1);
      const y1 = Math.min(y0 + 1, h - 1);
      const fy = sy - y0;
      for (let xv = 0; xv < ow; xv++) {
        const sx = xv / 2;
        const x0 = Math.min(Math.floor(sx), w - 1);
        const x1 = Math.min(x0 + 1, w - 1);
        const fx = sx - x0;
        const v00 = xd[base + y0 * w + x0];
        const v01 = xd[base + y0 * w + x1];
        const v10 = xd[base + y1 * w + x0];
        const v11 = xd[base + y1 * w + x1];
        od[obase + y * ow + xv] =
          (1 - fx) * (1 - fy) * v00 +
          fx * (1 - fy) * v01 +
          (1 - fx) * fy * v10 +
          fx * fy * v11;
      }
    }
  }
  return out;
}

function concatChan(a: Tensor, b: Tensor): Tensor {
  const c = a.c + b.c;
  const out = makeTensor(c, a.h, a.w);
  out.data.set(a.data, 0);
  out.data.set(b.data, a.c * a.h * a.w);
  return out;
}

function doubleConv(x: Tensor, midC: number, outC: number): Tensor {
  const w1 = heInit(midC, x.c, 3);
  let y = conv2d(x, w1, midC);
  instanceNorm(y);
  relu(y);
  const w2 = heInit(outC, midC, 3);
  y = conv2d(y, w2, outC);
  instanceNorm(y);
  relu(y);
  return y;
}

export function runMiniUnet(input: Tensor, baseC: number, depth: number): Stage[] {
  const stages: Stage[] = [];
  const factor = 2;

  stages.push({ label: "input", tensor: input });

  const enc: Tensor[] = [];
  let x = doubleConv(input, baseC, baseC);
  enc.push(x);
  stages.push({ label: "inc", tensor: x });

  for (let i = 1; i < depth; i++) {
    const targetC = baseC * (1 << i);
    x = maxpool2d(x);
    x = doubleConv(x, targetC, targetC);
    enc.push(x);
    stages.push({ label: `down ${i}`, tensor: x });
  }

  const btnTarget = baseC * (1 << depth);
  const btnOut = btnTarget / factor;
  x = maxpool2d(x);
  x = doubleConv(x, btnTarget, btnOut);
  stages.push({ label: "bottleneck", tensor: x });

  for (let i = 1; i <= depth; i++) {
    const skip = enc[depth - i];
    x = upsample2x(x);
    x = concatChan(skip, x);
    const isLast = i === depth;
    const outC = isLast ? baseC : (baseC * (1 << (depth - i))) / factor;
    const midC = isLast ? baseC : x.c / 2;
    x = doubleConv(x, midC, outC);
    stages.push({ label: `up ${i}`, tensor: x });
  }

  return stages;
}

// ---------- canvas helpers ----------

export function imageToTensor(source: CanvasImageSource, size: number): Tensor {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, 0, 0, size, size);
  const imgData = ctx.getImageData(0, 0, size, size);
  const data = new Float32Array(3 * size * size);
  const sz = size * size;
  for (let i = 0; i < sz; i++) {
    data[0 * sz + i] = imgData.data[i * 4 + 0] / 255;
    data[1 * sz + i] = imgData.data[i * 4 + 1] / 255;
    data[2 * sz + i] = imgData.data[i * 4 + 2] / 255;
  }
  return { c: 3, h: size, w: size, data };
}

export function drawSampleTo(canvas: HTMLCanvasElement, kind: string) {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width,
    h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (kind === "circles") {
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, "#ff6b6b");
    grad.addColorStop(0.5, "#ffd166");
    grad.addColorStop(1, "#06d6a0");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 2;
    for (let r = 8; r < w; r += 8) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (kind === "checker") {
    const cell = Math.max(4, Math.floor(w / 8));
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        const isOn = ((x / cell) + (y / cell)) % 2 === 0;
        ctx.fillStyle = isOn ? "#4ECDC4" : "#1A535C";
        ctx.fillRect(x, y, cell, cell);
      }
    }
  } else if (kind === "gradient") {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#FF006E");
    grad.addColorStop(0.5, "#8338EC");
    grad.addColorStop(1, "#3A86FF");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else if (kind === "face") {
    ctx.fillStyle = "#FFD9A0";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(w * 0.32, h * 0.38, w * 0.07, 0, Math.PI * 2);
    ctx.arc(w * 0.68, h * 0.38, w * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#222";
    ctx.lineWidth = Math.max(2, w * 0.04);
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.55, w * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
}

export function loadSampleAsImage(kind: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  drawSampleTo(c, kind);
  return c;
}

export function renderChannelToCanvas(
  canvas: HTMLCanvasElement,
  data: Float32Array,
  h: number,
  w: number,
  channelIdx: number,
  displaySize: number,
) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.createImageData(w, h);
  const sz = h * w;
  const base = channelIdx * sz;
  let min = Infinity,
    max = -Infinity;
  for (let i = 0; i < sz; i++) {
    const v = data[base + i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  for (let i = 0; i < sz; i++) {
    const v = ((data[base + i] - min) / range) * 255;
    imgData.data[i * 4 + 0] = v;
    imgData.data[i * 4 + 1] = v;
    imgData.data[i * 4 + 2] = v;
    imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  canvas.style.width = displaySize + "px";
  canvas.style.height = displaySize + "px";
}

export function renderRGBChannelToCanvas(
  canvas: HTMLCanvasElement,
  data: Float32Array,
  h: number,
  w: number,
  displaySize: number,
) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.createImageData(w, h);
  const sz = h * w;
  for (let i = 0; i < sz; i++) {
    imgData.data[i * 4 + 0] = data[0 * sz + i] * 255;
    imgData.data[i * 4 + 1] = data[1 * sz + i] * 255;
    imgData.data[i * 4 + 2] = data[2 * sz + i] * 255;
    imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  canvas.style.width = displaySize + "px";
  canvas.style.height = displaySize + "px";
}
