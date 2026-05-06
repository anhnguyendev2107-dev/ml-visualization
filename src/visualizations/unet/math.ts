// Pure math for the U-Net spec — mirrors `unet_model.py`.

export interface UnetParams {
  inputSize: number;
  baseChannels: number;
  depth: number;
  inChannels: number;
  outChannels: number;
  bilinear: boolean;
}

export type BlockKind =
  | "input"
  | "inc"
  | "down"
  | "bottleneck"
  | "dec"
  | "out_pre"
  | "out";

export interface Block {
  kind: BlockKind;
  label: string;
  inC: number;
  outC: number;
  spatial: number;
  params: number;
  /** decoder-only: index into spec.enc that this block consumes as skip */
  skipFrom?: number;
  upParams?: number;
  convParams?: number;
  concatC?: number;
  midC?: number;
}

export interface UnetSpec {
  enc: Block[];
  dec: Block[];
  out: Block;
}

function doubleConvParams(inC: number, outC: number, midC: number | null = null) {
  if (midC === null) midC = outC;
  return 9 * inC * midC + 2 * midC + 9 * midC * outC + 2 * outC;
}

function transposeConvParams(inC: number, outC: number) {
  return 4 * inC * outC + outC;
}

function outConvParams(inC: number, nClasses: number) {
  return inC * nClasses + nClasses;
}

export function buildSpec(p: UnetParams): UnetSpec {
  const factor = p.bilinear ? 2 : 1;
  const enc: Block[] = [];
  let spatial = p.inputSize;
  let prevC = p.inChannels;

  // inc
  {
    const outC = p.baseChannels;
    enc.push({
      kind: "inc",
      label: "inc",
      inC: prevC,
      outC,
      spatial,
      params: doubleConvParams(prevC, outC),
    });
    prevC = outC;
  }

  for (let i = 1; i <= p.depth; i++) {
    const isLast = i === p.depth;
    spatial = Math.max(1, Math.floor(spatial / 2));
    const targetC = p.baseChannels * (1 << i);
    const outC = isLast ? Math.floor(targetC / factor) : targetC;
    enc.push({
      kind: isLast ? "bottleneck" : "down",
      label: isLast ? "bottleneck" : `down ${i}`,
      inC: prevC,
      outC,
      spatial,
      params: doubleConvParams(prevC, outC),
    });
    prevC = outC;
  }

  const dec: Block[] = [];
  for (let i = 1; i <= p.depth; i++) {
    const skipIdx = p.depth - i;
    const skipBlock = enc[skipIdx];
    const isLast = i === p.depth;
    spatial = spatial * 2;
    const skipC = skipBlock.outC;

    if (p.bilinear) {
      const concatC = prevC + skipC;
      const midC = Math.floor(concatC / 2);
      const targetC = p.baseChannels * (1 << (p.depth - i));
      const convOutC = isLast ? p.baseChannels : Math.floor(targetC / factor);
      const params = doubleConvParams(concatC, convOutC, midC);
      dec.push({
        kind: isLast ? "out_pre" : "dec",
        label: `up ${i}`,
        inC: prevC,
        outC: convOutC,
        spatial,
        params,
        skipFrom: skipIdx,
        upParams: 0,
        convParams: params,
        concatC,
        midC,
      });
      prevC = convOutC;
    } else {
      const upHalf = Math.floor(prevC / 2);
      const concatC = upHalf + skipC;
      const targetC = p.baseChannels * (1 << (p.depth - i));
      const convOutC = isLast ? p.baseChannels : targetC;
      const upParams = transposeConvParams(prevC, upHalf);
      const params = doubleConvParams(concatC, convOutC);
      dec.push({
        kind: isLast ? "out_pre" : "dec",
        label: `up ${i}`,
        inC: prevC,
        outC: convOutC,
        spatial,
        params: upParams + params,
        skipFrom: skipIdx,
        upParams,
        convParams: params,
        concatC,
      });
      prevC = convOutC;
    }
  }

  const out: Block = {
    kind: "out",
    label: "output (1×1 conv)",
    inC: prevC,
    outC: p.outChannels,
    spatial,
    params: outConvParams(prevC, p.outChannels),
  };

  return { enc, dec, out };
}

export function totalParams(spec: UnetSpec) {
  const e = spec.enc.reduce((s, b) => s + b.params, 0);
  const d = spec.dec.reduce((s, b) => s + b.params, 0);
  return { encoder: e, decoder: d, out: spec.out.params, total: e + d + spec.out.params };
}

export function formatNum(n: number) {
  return n.toLocaleString("en-US");
}
export function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(bytes >= 100 ? 0 : 1)} ${units[i]}`;
}
