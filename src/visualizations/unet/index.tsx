"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  buildSpec,
  formatBytes,
  formatNum,
  totalParams,
  type Block,
  type UnetParams,
  type UnetSpec,
} from "./math";
import {
  drawSampleTo,
  imageToTensor,
  loadSampleAsImage,
  renderChannelToCanvas,
  renderRGBChannelToCanvas,
  runMiniUnet,
  type Stage,
} from "./mini-unet";

// ---------- layout helpers (SVG diagram) -----------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";
const ISO_DX = 0.866;
const ISO_DY = 0.5;
const KIND_COLORS: Record<string, string> = {
  input: "#5DADE2",
  inc: "#7FB3D5",
  down: "#7FB3D5",
  bottleneck: "#F5B041",
  dec: "#82E0AA",
  out_pre: "#82E0AA",
  out: "#E59866",
};

function color(kind: string) {
  return KIND_COLORS[kind] ?? "#cccccc";
}
function shade(hex: string, factor: number) {
  const r = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * factor)));
  const b = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * factor)));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
function frontSize(s: number) {
  return Math.max(22, Math.min(95, Math.sqrt(s) * 4.2));
}
function blockDepth(c: number) {
  return Math.max(10, Math.min(45, Math.sqrt(c) * 2));
}

interface Layout {
  positions: Map<string, { x: number; y: number }>;
  viewBox: string;
  inputBlock: Block;
  inputId: string;
}

function computeLayout(spec: UnetSpec): Layout {
  const padX = 170;
  const padY = 100;
  const stepX = 130;
  const stepY = 130;
  const positions = new Map<string, { x: number; y: number }>();
  const inputBlock: Block = {
    kind: "input",
    label: "input",
    inC: 0,
    outC: spec.enc[0].inC,
    spatial: spec.enc[0].spatial,
    params: 0,
  };
  const inputX = padX - stepX;
  const inputY = padY;
  positions.set("input", { x: inputX, y: inputY });
  spec.enc.forEach((_, i) => {
    positions.set(`enc-${i}`, { x: padX + i * stepX, y: padY + i * stepY });
  });
  const bottomIdx = spec.enc.length - 1;
  const bottom = positions.get(`enc-${bottomIdx}`)!;
  spec.dec.forEach((_, i) => {
    positions.set(`dec-${i}`, {
      x: bottom.x + (i + 1) * stepX,
      y: bottom.y - (i + 1) * stepY,
    });
  });
  const lastDec = spec.dec.length - 1;
  const lastDecPos = positions.get(`dec-${lastDec}`)!;
  positions.set("out", { x: lastDecPos.x + stepX, y: lastDecPos.y });

  const xs = Array.from(positions.values()).map((p) => p.x);
  const ys = Array.from(positions.values()).map((p) => p.y);
  const minX = Math.min(...xs) - 100;
  const minY = Math.min(...ys) - 50;
  const maxX = Math.max(...xs) + 120;
  const maxY = Math.max(...ys) + 100;
  return {
    positions,
    viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
    inputBlock,
    inputId: "input",
  };
}

// ---------- diagram component ----------------------------------------------

interface DiagramProps {
  spec: UnetSpec;
  layout: Layout;
  activeId: string | null;
  doneIds: Set<string>;
  skipSourceId: string | null;
  highlightId: string | null;
  highlightSkipDecIdx: number | null;
  onBlockHover: (block: Block | null, evt?: ReactMouseEvent) => void;
  onBlockClick: (id: string, block: Block) => void;
}

function blockClass(
  id: string,
  props: Pick<DiagramProps, "activeId" | "doneIds" | "skipSourceId" | "highlightId">,
  anyAnimActive: boolean,
  anyHighlight: boolean,
) {
  const cls = ["unet-block"];
  if (props.activeId === id) cls.push("active");
  else if (props.doneIds.has(id)) cls.push("done");
  if (props.skipSourceId === id) cls.push("skip-source");
  if (props.highlightId === id) cls.push("highlight");
  // dim everything else when we have a focus state
  const isFocused =
    props.activeId === id ||
    props.skipSourceId === id ||
    props.highlightId === id ||
    props.doneIds.has(id);
  if ((anyAnimActive || anyHighlight) && !isFocused) cls.push("dim");
  return cls.join(" ");
}

function Diagram(props: DiagramProps) {
  const { spec, layout } = props;
  const anyAnimActive = props.activeId != null;
  const anyHighlight = props.highlightId != null;

  const renderArrow = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    stroke: string,
    key: string,
  ) => (
    <line
      key={key}
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke={stroke}
      strokeWidth={2}
      markerEnd="url(#arrowhead)"
    />
  );

  const renderBlock = (id: string, block: Block) => {
    const pos = layout.positions.get(id)!;
    const fs = frontSize(block.spatial);
    const dep = blockDepth(block.outC);
    const dx = dep * ISO_DX;
    const dy = -dep * ISO_DY;
    const baseColor = color(block.kind);
    const topColor = shade(baseColor, 1.18);
    const rightColor = shade(baseColor, 0.72);
    const x0 = -fs / 2,
      y0 = -fs / 2,
      x1 = fs / 2,
      y1 = fs / 2;

    return (
      <g
        key={id}
        className={blockClass(id, props, anyAnimActive, anyHighlight)}
        transform={`translate(${pos.x}, ${pos.y})`}
        onMouseEnter={(e) => props.onBlockHover(block, e)}
        onMouseMove={(e) => props.onBlockHover(block, e)}
        onMouseLeave={() => props.onBlockHover(null)}
        onClick={() => props.onBlockClick(id, block)}
      >
        <polygon
          className="block-face top"
          points={`${x0},${y0} ${x1},${y0} ${x1 + dx},${y0 + dy} ${x0 + dx},${y0 + dy}`}
          fill={topColor}
          stroke="#0b0f17"
          strokeWidth={1}
        />
        <polygon
          className="block-face right"
          points={`${x1},${y0} ${x1 + dx},${y0 + dy} ${x1 + dx},${y1 + dy} ${x1},${y1}`}
          fill={rightColor}
          stroke="#0b0f17"
          strokeWidth={1}
        />
        <rect
          className="block-face front"
          x={x0}
          y={y0}
          width={fs}
          height={fs}
          fill={baseColor}
          stroke="#0b0f17"
          strokeWidth={1.2}
        />
        <text className="shape-badge" textAnchor="middle" x={0} y={y0 + dy - 6}>
          {`${block.outC}ch · ${block.spatial}²`}
        </text>
        <text className="label-text" textAnchor="middle" x={0} y={y1 + 16}>
          {block.label}
        </text>
      </g>
    );
  };

  // arrows
  const arrows: React.ReactNode[] = [];
  const inputPos = layout.positions.get("input")!;
  arrows.push(renderArrow(inputPos, layout.positions.get("enc-0")!, "#999", "in-arr"));
  for (let i = 0; i < spec.enc.length - 1; i++) {
    arrows.push(
      renderArrow(
        layout.positions.get(`enc-${i}`)!,
        layout.positions.get(`enc-${i + 1}`)!,
        "var(--down)",
        `enc-${i}-arr`,
      ),
    );
  }
  const bottomIdx = spec.enc.length - 1;
  arrows.push(
    renderArrow(
      layout.positions.get(`enc-${bottomIdx}`)!,
      layout.positions.get("dec-0")!,
      "var(--bot)",
      "bot-arr",
    ),
  );
  for (let i = 0; i < spec.dec.length - 1; i++) {
    arrows.push(
      renderArrow(
        layout.positions.get(`dec-${i}`)!,
        layout.positions.get(`dec-${i + 1}`)!,
        "var(--up)",
        `dec-${i}-arr`,
      ),
    );
  }
  arrows.push(
    renderArrow(
      layout.positions.get(`dec-${spec.dec.length - 1}`)!,
      layout.positions.get("out")!,
      "var(--out)",
      "out-arr",
    ),
  );

  // skip lines
  const skipLines = spec.dec.map((d, i) => {
    if (d.skipFrom == null) return null;
    const a = layout.positions.get(`enc-${d.skipFrom}`)!;
    const b = layout.positions.get(`dec-${i}`)!;
    const dx = b.x - a.x;
    const cy = Math.min(a.y, b.y) - 60;
    const path = `M ${a.x} ${a.y} C ${a.x + dx * 0.25} ${cy}, ${b.x - dx * 0.25} ${cy}, ${b.x} ${b.y}`;
    const isActive =
      props.skipSourceId === `enc-${d.skipFrom}` ||
      props.highlightSkipDecIdx === i;
    const cls = ["skip-line"];
    if (isActive) cls.push("active");
    if ((anyAnimActive || anyHighlight) && !isActive) cls.push("dim");
    return (
      <path
        key={`skip-${i}`}
        className={cls.join(" ")}
        d={path}
        stroke="var(--skip)"
        strokeWidth={1.8}
        strokeDasharray="6 4"
        fill="none"
      />
    );
  });

  return (
    <svg
      className="unet-diagram"
      xmlns={SVG_NS}
      viewBox={layout.viewBox}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <marker
          id="arrowhead"
          viewBox="0 0 10 10"
          refX={8}
          refY={5}
          markerWidth={6}
          markerHeight={6}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#cdd5e1" />
        </marker>
      </defs>
      {arrows}
      {skipLines}
      {renderBlock("input", layout.inputBlock)}
      {spec.enc.map((b, i) => renderBlock(`enc-${i}`, b))}
      {spec.dec.map((b, i) => renderBlock(`dec-${i}`, b))}
      {renderBlock("out", spec.out)}
    </svg>
  );
}

// ---------- animation steps ------------------------------------------------

interface AnimStep {
  type: string;
  title: string;
  desc: string;
  blockId?: string;
  skipBlockId?: string;
  shapeBefore: [number, number, number] | null;
  shapeAfter: [number, number, number];
  refSpatial: number;
  concat?: { skipC: number; upC: number; totalC: number; outC: number };
}

function buildSteps(spec: UnetSpec): AnimStep[] {
  const steps: AnimStep[] = [];
  const inH = spec.enc[0].spatial;
  const inC = spec.enc[0].inC;

  steps.push({
    type: "input",
    title: "INPUT",
    desc: `Ảnh đầu vào: ${inC} channels (vd: RGB), spatial ${inH}×${inH}.`,
    blockId: "input",
    shapeBefore: null,
    shapeAfter: [inC, inH, inH],
    refSpatial: inH,
  });

  spec.enc.forEach((b, i) => {
    const inShape: [number, number, number] =
      i === 0
        ? [b.inC, b.spatial, b.spatial]
        : [spec.enc[i - 1].outC, spec.enc[i - 1].spatial, spec.enc[i - 1].spatial];
    let desc = "";
    if (b.kind === "inc") {
      desc = `DoubleConv = (Conv 3×3 + BN + ReLU) ×2. Channels ${b.inC}→${b.outC}, giữ spatial.`;
    } else if (b.kind === "bottleneck") {
      desc = `Bottleneck — đáy chữ U. MaxPool ↓2 + DoubleConv ${b.inC}→${b.outC}.`;
    } else {
      desc = `MaxPool 2×2 (spatial /2 → ${b.spatial}²) + DoubleConv ${b.inC}→${b.outC}.`;
    }
    steps.push({
      type: b.kind,
      title: b.label.toUpperCase(),
      desc,
      blockId: `enc-${i}`,
      shapeBefore: inShape,
      shapeAfter: [b.outC, b.spatial, b.spatial],
      refSpatial: inH,
    });
  });

  spec.dec.forEach((d, i) => {
    const skipBlock = spec.enc[d.skipFrom!];
    const prevBlock = i === 0 ? spec.enc[spec.enc.length - 1] : spec.dec[i - 1];
    const prevShape: [number, number, number] = [
      prevBlock.outC,
      prevBlock.spatial,
      prevBlock.spatial,
    ];
    const upC = (d.concatC ?? skipBlock.outC + prevBlock.outC) - skipBlock.outC;
    const desc = `1) Upsample ↑2 (${prevBlock.spatial}²→${d.spatial}², ${upC} ch).
2) Concat skip "${skipBlock.label}" (${skipBlock.outC} ch) → ${d.concatC} ch.
3) DoubleConv ${d.concatC}→${d.outC}.`;
    steps.push({
      type: "up",
      title: d.label.toUpperCase(),
      desc,
      blockId: `dec-${i}`,
      skipBlockId: `enc-${d.skipFrom}`,
      shapeBefore: prevShape,
      shapeAfter: [d.outC, d.spatial, d.spatial],
      refSpatial: inH,
      concat: {
        skipC: skipBlock.outC,
        upC,
        totalC: d.concatC!,
        outC: d.outC,
      },
    });
  });

  steps.push({
    type: "out",
    title: "OUTPUT",
    desc: `Conv 1×1: ${spec.out.inC}→${spec.out.outC} channels per pixel = segmentation logits.`,
    blockId: "out",
    shapeBefore: [spec.out.inC, spec.out.spatial, spec.out.spatial],
    shapeAfter: [spec.out.outC, spec.out.spatial, spec.out.spatial],
    refSpatial: inH,
  });

  return steps;
}

// ---------- main page component --------------------------------------------

const DEFAULT_PARAMS: UnetParams = {
  inputSize: 512,
  baseChannels: 64,
  depth: 4,
  inChannels: 3,
  outChannels: 1,
  bilinear: true,
};

export default function UnetVisualization() {
  const [params, setParams] = useState<UnetParams>(DEFAULT_PARAMS);
  const spec = useMemo(() => buildSpec(params), [params]);
  const layout = useMemo(() => computeLayout(spec), [spec]);
  const steps = useMemo(() => buildSteps(spec), [spec]);
  const stats = useMemo(() => totalParams(spec), [spec]);
  const lastEnc = spec.enc[spec.enc.length - 1];

  const [cursor, setCursor] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1100);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [tooltip, setTooltip] = useState<{
    block: Block;
    x: number;
    y: number;
  } | null>(null);
  const diagramWrapRef = useRef<HTMLDivElement | null>(null);

  // zoom + pan
  const [zoom, setZoom] = useState(0.75);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );
  const resetView = useCallback(() => {
    setZoom(0.75);
    setPan({ x: 0, y: 0 });
  }, []);
  const zoomBy = useCallback((factor: number) => {
    setZoom((z) => Math.min(4, Math.max(0.25, z * factor)));
  }, []);

  // reset cursor when spec changes
  useEffect(() => {
    setCursor(-1);
    setPlaying(false);
    setHighlightId(null);
    setZoom(0.75);
    setPan({ x: 0, y: 0 });
  }, [spec]);

  // wheel zoom (centred on cursor) — non-passive so we can preventDefault
  useEffect(() => {
    const wrap = diagramWrapRef.current;
    if (!wrap) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      setZoom((z) => {
        const next = Math.min(4, Math.max(0.25, z * factor));
        const real = next / z;
        setPan((p) => ({
          x: cx - (cx - p.x) * real,
          y: cy - (cy - p.y) * real,
        }));
        return next;
      });
    };
    wrap.addEventListener("wheel", handler, { passive: false });
    return () => wrap.removeEventListener("wheel", handler);
  }, []);

  // playback ticker
  useEffect(() => {
    if (!playing) return;
    if (cursor >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setCursor((c) => c + 1), speed);
    return () => clearTimeout(t);
  }, [playing, cursor, speed, steps.length]);

  const currentStep = cursor >= 0 ? steps[cursor] : null;
  const doneIds = useMemo(() => {
    const s = new Set<string>();
    for (let i = 0; i < cursor; i++) {
      const st = steps[i];
      if (st.blockId) s.add(st.blockId);
    }
    return s;
  }, [cursor, steps]);

  const activeId = currentStep?.blockId ?? null;
  const skipSourceId = currentStep?.skipBlockId ?? null;
  const highlightSkipDecIdx =
    highlightId?.startsWith("dec-")
      ? parseInt(highlightId.split("-")[1], 10)
      : null;

  const onParam = useCallback(<K extends keyof UnetParams>(key: K, value: UnetParams[K]) => {
    setParams((p) => {
      const next = { ...p, [key]: value };
      // guard
      const minSize = 1 << next.depth;
      if (next.inputSize < minSize) next.inputSize = minSize;
      return next;
    });
  }, []);

  const handleBlockHover = (block: Block | null, evt?: ReactMouseEvent) => {
    if (!block || !evt) {
      setTooltip(null);
      return;
    }
    const wrap = diagramWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    setTooltip({
      block,
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
    });
  };

  const handleBlockClick = (id: string) => {
    let encIdx: number | null = null;
    if (id.startsWith("enc-")) encIdx = parseInt(id.split("-")[1], 10);
    else if (id.startsWith("dec-")) {
      const decIdx = parseInt(id.split("-")[1], 10);
      const dec = spec.dec[decIdx];
      if (dec.skipFrom != null) encIdx = dec.skipFrom;
    }
    if (encIdx == null) {
      setHighlightId(null);
      return;
    }
    const next = highlightId === `enc-${encIdx}` ? null : `enc-${encIdx}`;
    setHighlightId(next);
  };

  const goPrev = () => {
    setPlaying(false);
    setCursor((c) => Math.max(0, c - 1));
  };
  const goNext = () => {
    setPlaying(false);
    setCursor((c) => Math.min(steps.length - 1, c + 1));
  };
  const goReset = () => {
    setPlaying(false);
    setCursor(-1);
  };
  const togglePlay = () => {
    if (cursor >= steps.length - 1) setCursor(-1);
    setPlaying((p) => !p);
  };

  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div className="flex h-[calc(100vh-49px)] flex-col">
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-[320px] shrink-0 overflow-y-auto border-r border-[#2a3548] bg-[var(--panel)] p-5 text-[13px]">
          <h2 className="mb-3 text-[11px] uppercase tracking-[1.5px] text-[var(--muted)]">
            Hyperparameters
          </h2>

          <ControlRange
            label="Input size (HxW)"
            min={64}
            max={1024}
            step={32}
            value={params.inputSize}
            onChange={(v) => onParam("inputSize", v)}
          />
          <ControlRange
            label="Base channels"
            min={8}
            max={128}
            step={8}
            value={params.baseChannels}
            onChange={(v) => onParam("baseChannels", v)}
          />
          <ControlRange
            label="Depth (encoder stages)"
            min={2}
            max={6}
            step={1}
            value={params.depth}
            onChange={(v) => onParam("depth", v)}
          />
          <ControlNumber
            label="Input channels"
            min={1}
            max={16}
            value={params.inChannels}
            onChange={(v) => onParam("inChannels", v)}
          />
          <ControlNumber
            label="Output classes"
            min={1}
            max={100}
            value={params.outChannels}
            onChange={(v) => onParam("outChannels", v)}
          />
          <label className="mb-3 mt-1 flex cursor-pointer items-center gap-2 text-[#c9d3e3]">
            <input
              type="checkbox"
              checked={params.bilinear}
              onChange={(e) => onParam("bilinear", e.target.checked)}
            />
            Bilinear upsample (uncheck = ConvTranspose2d)
          </label>

          <hr className="my-4 border-[#2a3548]" />
          <h2 className="mb-3 text-[11px] uppercase tracking-[1.5px] text-[var(--muted)]">
            Stats
          </h2>
          <table className="w-full">
            <tbody>
              <StatRow label="Total params" value={formatNum(stats.total)} />
              <StatRow label="Encoder" value={formatNum(stats.encoder)} />
              <StatRow label="Decoder" value={formatNum(stats.decoder)} />
              <StatRow label="Memory (fp32)" value={formatBytes(stats.total * 4)} />
              <StatRow
                label="Bottleneck"
                value={`${lastEnc.outC}×${lastEnc.spatial}²`}
              />
            </tbody>
          </table>

          <hr className="my-4 border-[#2a3548]" />
          <button
            onClick={() => setDemoOpen(true)}
            className="w-full rounded-md bg-[var(--accent)] px-3 py-2 text-[13px] font-semibold text-[#0b0f17] transition hover:brightness-110"
          >
            🖼 Try with real image
          </button>
        </aside>

        {/* Diagram pane */}
        <section className="flex flex-1 flex-col min-w-0 min-h-0">
          <div
            ref={diagramWrapRef}
            className="relative flex-1 min-h-[280px] overflow-hidden select-none"
            style={{
              background:
                "radial-gradient(circle at 20% 0%, #1a2335 0%, transparent 40%), radial-gradient(circle at 80% 100%, #1f2a3f 0%, transparent 40%), var(--bg)",
              cursor: dragRef.current ? "grabbing" : "grab",
            }}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              const target = e.target as Element;
              if (target.closest(".unet-block")) return; // let block clicks through
              dragRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                baseX: pan.x,
                baseY: pan.y,
              };
            }}
            onMouseMove={(e) => {
              const d = dragRef.current;
              if (!d) return;
              setPan({
                x: d.baseX + (e.clientX - d.startX),
                y: d.baseY + (e.clientY - d.startY),
              });
            }}
            onMouseUp={() => {
              dragRef.current = null;
            }}
            onMouseLeave={() => {
              dragRef.current = null;
            }}
          >
            <Legend />
            <ZoomControls
              zoom={zoom}
              onIn={() => zoomBy(1.25)}
              onOut={() => zoomBy(1 / 1.25)}
              onReset={resetView}
            />
            <div
              className="h-full w-full"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                transition: dragRef.current ? "none" : "transform 0.12s ease-out",
              }}
            >
              <Diagram
                spec={spec}
                layout={layout}
                activeId={activeId}
                doneIds={doneIds}
                skipSourceId={skipSourceId}
                highlightId={highlightId}
                highlightSkipDecIdx={highlightSkipDecIdx}
                onBlockHover={handleBlockHover}
                onBlockClick={handleBlockClick}
              />
            </div>
            {tooltip && (
              <Tooltip
                block={tooltip.block}
                wrapRef={diagramWrapRef}
                x={tooltip.x}
                y={tooltip.y}
              />
            )}
          </div>

          <AnimationPanel
            step={currentStep}
            cursor={cursor}
            total={steps.length}
            playing={playing}
            speed={speed}
            onPlay={togglePlay}
            onPrev={goPrev}
            onNext={goNext}
            onReset={goReset}
            onSpeed={setSpeed}
          />
        </section>
      </div>

      {demoOpen && <FeatureMapDemo onClose={() => setDemoOpen(false)} />}
    </div>
  );
}

// ---------- small UI bits --------------------------------------------------

function ControlRange({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3.5">
      <label className="mb-1 block text-[#c9d3e3]">{label}</label>
      <div className="flex items-center gap-2.5">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="flex-1"
        />
        <output className="min-w-[38px] text-right font-semibold text-[var(--accent)] tabular-nums">
          {value}
        </output>
      </div>
    </div>
  );
}

function ControlNumber({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3.5">
      <label className="mb-1 block text-[#c9d3e3]">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value || "0", 10))}
        className="w-20 rounded border border-[#36405a] bg-[var(--panel-2)] px-2 py-1 text-[var(--fg)]"
      />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-[#232d3f]">
      <th className="py-1 px-1.5 text-left font-normal text-[var(--muted)]">{label}</th>
      <td className="py-1 px-1.5 text-right font-medium tabular-nums text-[var(--accent)]">
        {value}
      </td>
    </tr>
  );
}

function Legend() {
  return (
    <div className="absolute right-4 top-3 z-10 flex flex-col gap-1 rounded-md border border-[#2a3548] bg-[#1a2230]/90 px-3 py-2 text-[12px]">
      <LegendSwatch color="var(--enc)" label="Encoder" />
      <LegendSwatch color="var(--bot)" label="Bottleneck" />
      <LegendSwatch color="var(--dec)" label="Decoder" />
      <LegendSwatch color="var(--out)" label="Output" />
      <LegendLine color="var(--skip)" dashed label="Skip connection" />
      <LegendLine color="var(--down)" label="MaxPool ↓" />
      <LegendLine color="var(--up)" label="Upsample ↑" />
    </div>
  );
}

function ZoomControls({
  zoom,
  onIn,
  onOut,
  onReset,
}: {
  zoom: number;
  onIn: () => void;
  onOut: () => void;
  onReset: () => void;
}) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div
      className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-md border border-[#2a3548] bg-[#1a2230]/90 p-1 text-[12px] shadow-lg"
      onMouseDown={stop}
      onClick={stop}
    >
      <button
        onClick={onOut}
        title="Zoom out (or Ctrl/⌘ + scroll)"
        className="h-7 w-7 rounded text-base text-[var(--fg)] transition hover:bg-[var(--panel-2)]"
      >
        −
      </button>
      <button
        onClick={onReset}
        title="Reset view"
        className="h-7 min-w-[52px] rounded px-1 font-mono text-[11px] text-[var(--accent)] tabular-nums transition hover:bg-[var(--panel-2)]"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        onClick={onIn}
        title="Zoom in"
        className="h-7 w-7 rounded text-base text-[var(--fg)] transition hover:bg-[var(--panel-2)]"
      >
        +
      </button>
    </div>
  );
}
function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <i
        className="inline-block h-2.5 w-3.5 rounded-sm border border-black/40"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
function LegendLine({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <i
        className="inline-block h-0 w-4 border-t-2"
        style={{ borderColor: color, borderTopStyle: dashed ? "dashed" : "solid" }}
      />
      {label}
    </span>
  );
}

function Tooltip({
  block,
  wrapRef,
  x,
  y,
}: {
  block: Block;
  wrapRef: React.RefObject<HTMLDivElement | null>;
  x: number;
  y: number;
}) {
  const wrap = wrapRef.current;
  let left = x + 14;
  let top = y + 14;
  if (wrap) {
    const w = 260;
    const h = 180;
    if (left + w > wrap.clientWidth) left = x - w - 14;
    if (top + h > wrap.clientHeight) top = y - h - 14;
  }
  const rows: [string, string][] = [];
  if (block.kind === "input") {
    rows.push(["kind", "raw image tensor"]);
    rows.push(["shape", `${block.outC} × ${block.spatial} × ${block.spatial}`]);
  } else {
    rows.push(["kind", block.kind]);
    rows.push(["shape", `${block.outC} × ${block.spatial} × ${block.spatial}`]);
    rows.push(["input ch", String(block.inC)]);
    rows.push(["output ch", String(block.outC)]);
    if (block.midC != null) rows.push(["mid ch", String(block.midC)]);
    if (block.concatC != null) rows.push(["after concat", `${block.concatC} ch`]);
    rows.push(["params", formatNum(block.params)]);
  }
  rows.push([
    "act (fp32)",
    formatBytes(block.outC * block.spatial * block.spatial * 4),
  ]);
  return (
    <div className="unet-tooltip" style={{ left, top }}>
      <h3>{block.label}</h3>
      {rows.map(([k, v]) => (
        <div className="kv" key={k}>
          <span>{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}

function AnimationPanel({
  step,
  cursor,
  total,
  playing,
  speed,
  onPlay,
  onPrev,
  onNext,
  onReset,
  onSpeed,
}: {
  step: AnimStep | null;
  cursor: number;
  total: number;
  playing: boolean;
  speed: number;
  onPlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  onSpeed: (n: number) => void;
}) {
  const fillBefore = step?.shapeBefore
    ? (step.shapeBefore[1] / step.refSpatial) * 100
    : 0;
  const fillAfter = step ? (step.shapeAfter[1] / step.refSpatial) * 100 : 0;

  return (
    <div className="max-h-[320px] shrink-0 overflow-y-auto border-t border-[#2a3548] bg-[var(--panel)]/90 p-4 text-[13px]">
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[#232d3f] pb-2.5">
        <ControlBtn onClick={onReset} title="Reset">↺</ControlBtn>
        <ControlBtn onClick={onPrev} title="Previous">◀</ControlBtn>
        <button
          onClick={onPlay}
          className={`rounded-md border px-3 py-1.5 font-semibold transition ${
            playing
              ? "border-amber-500 bg-amber-500 text-[#0b0f17]"
              : "border-[var(--accent)] bg-[var(--accent)] text-[#0b0f17]"
          }`}
        >
          {playing ? "❚❚ Pause" : "▶ Play forward pass"}
        </button>
        <ControlBtn onClick={onNext} title="Next">▶</ControlBtn>
        <span className="ml-2 text-[var(--muted)] tabular-nums">
          Step <b className="text-white">{Math.max(0, cursor + 1)}</b> / {total}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-[var(--muted)]">
          Speed
          <input
            type="range"
            min={300}
            max={2500}
            step={100}
            value={speed}
            onChange={(e) => onSpeed(parseInt(e.target.value, 10))}
            className="w-28"
          />
          <output className="w-10 text-right tabular-nums text-[var(--accent)]">
            {(speed / 1000).toFixed(1)}s
          </output>
        </label>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr_1.2fr] grid-cols-1">
        <div>
          <h3 className="mb-1 text-[13px] uppercase tracking-wider text-[var(--accent)]">
            {step ? step.title : "— Bấm ▶ Play để xem dữ liệu chảy qua mạng —"}
          </h3>
          <p className="m-0 leading-relaxed text-[#c9d3e3] whitespace-pre-line">
            {step
              ? step.desc
              : "Mỗi bước highlight block đang xử lý, hiện shape tensor [C×H×W]."}
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="viz-shape-pill">
              {step?.shapeBefore ? formatShape(step.shapeBefore) : "—"}
            </span>
            <span className="text-[var(--muted)]">→</span>
            <span className="viz-shape-pill">
              {step ? formatShape(step.shapeAfter) : "—"}
            </span>
          </div>
          <SpatialBar label="spatial in" pct={fillBefore} />
          <SpatialBar label="spatial out" pct={fillAfter} />
        </div>

        {step?.concat ? (
          <div className="border-l border-[#2a3548] pl-4">
            <div className="mb-1.5 text-xs text-[var(--muted)]">
              Skip concatenation (channel-wise):
            </div>
            <CcRow
              tag="skip"
              channels={step.concat.skipC}
              maxC={step.concat.totalC}
              barClass="skip"
            />
            <CcRow
              tag="up"
              channels={step.concat.upC}
              maxC={step.concat.totalC}
              barClass="up"
            />
            <CcRow
              tag="concat"
              channels={step.concat.totalC}
              maxC={step.concat.totalC}
              barClass="concat"
            />
            <div className="my-1 pl-[60px] text-[var(--accent)]">
              ⇩ DoubleConv
            </div>
            <CcRow
              tag="out"
              channels={step.concat.outC}
              maxC={step.concat.totalC}
              barClass="out"
            />
          </div>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}

function ControlBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded-md border border-[#36405a] bg-[var(--panel-2)] px-3 py-1.5 text-[var(--fg)] transition hover:bg-[#2e3a52]"
    >
      {children}
    </button>
  );
}

function SpatialBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <div className="w-[78px] text-right text-[11px] text-[var(--muted)]">{label}</div>
      <div className="h-3.5 w-[180px] overflow-hidden rounded-sm border border-[#2a3548] bg-[#0b0f17]">
        <div
          className="h-full transition-[width] duration-500"
          style={{
            width: `${pct.toFixed(1)}%`,
            background: "linear-gradient(90deg,#5DADE2,#82E0AA)",
          }}
        />
      </div>
    </div>
  );
}

function CcRow({
  tag,
  channels,
  maxC,
  barClass,
}: {
  tag: string;
  channels: number;
  maxC: number;
  barClass: "skip" | "up" | "concat" | "out";
}) {
  const pct = Math.max(8, (channels / maxC) * 100);
  const bg: Record<string, string> = {
    skip: "var(--skip)",
    up: "var(--dec)",
    concat: "linear-gradient(90deg,var(--skip) 0% 50%,var(--dec) 50% 100%)",
    out: "var(--enc)",
  };
  return (
    <div className="mb-1 flex items-center gap-2">
      <span className="w-[60px] text-right text-[11px] text-[var(--muted)] font-mono">
        {tag}
      </span>
      <div className="relative h-[18px] flex-1 max-w-[280px] overflow-hidden rounded-sm border border-[#2a3548] bg-[#0b0f17]">
        <div
          className="h-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: bg[barClass] }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-[#0b0f17] font-mono">
          {channels} ch
        </span>
      </div>
    </div>
  );
}

function formatShape(s: [number, number, number]) {
  return `[${s[0]} × ${s[1]} × ${s[2]}]`;
}

// ---------- feature map demo modal -----------------------------------------

const SAMPLES = [
  { id: "circles", label: "Circles" },
  { id: "checker", label: "Checker" },
  { id: "gradient", label: "Gradient" },
  { id: "face", label: "Face" },
];

function FeatureMapDemo({ onClose }: { onClose: () => void }) {
  const [baseC, setBaseC] = useState(8);
  const [depth, setDepth] = useState(3);
  const [size, setSize] = useState(64);
  const [status, setStatus] = useState("Bấm 1 sample hoặc upload ảnh.");
  const [running, setRunning] = useState(false);
  const [activeSample, setActiveSample] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[] | null>(null);
  const sourceRef = useRef<CanvasImageSource | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const sampleRefs = useRef<Record<string, HTMLCanvasElement | null>>({});

  // pre-render sample thumbnails
  useEffect(() => {
    SAMPLES.forEach((s) => {
      const c = sampleRefs.current[s.id];
      if (c) drawSampleTo(c, s.id);
    });
  }, []);

  const setInputPreview = (source: CanvasImageSource) => {
    sourceRef.current = source;
    const cv = previewRef.current;
    if (cv) {
      const ctx = cv.getContext("2d")!;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(source, 0, 0, cv.width, cv.height);
    }
    setStatus("Ảnh đã sẵn sàng. Bấm Run.");
  };

  const onPickSample = (id: string) => {
    setActiveSample(id);
    setInputPreview(loadSampleAsImage(id));
  };

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setActiveSample(null);
      setInputPreview(img);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const run = () => {
    if (!sourceRef.current) return;
    setStatus("⏳ Running mini-UNet...");
    setRunning(true);
    setTimeout(() => {
      const t0 = performance.now();
      const tensor = imageToTensor(sourceRef.current!, size);
      const result = runMiniUnet(tensor, baseC, depth);
      const dt = performance.now() - t0;
      setStages(result);
      setStatus(`✓ Done in ${dt.toFixed(0)} ms · ${result.length} stages`);
      setRunning(false);
    }, 30);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative flex h-[90vh] w-[96vw] max-w-[1200px] flex-col overflow-hidden rounded-lg border border-[#2a3548] bg-[var(--panel)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2a3548] bg-[#161e2c] px-5 py-3">
          <h2 className="text-base font-semibold">
            🖼 Feature map demo — UNet thật chạy trong browser
          </h2>
          <button
            onClick={onClose}
            className="text-2xl text-[var(--fg)] transition hover:text-[var(--accent)]"
          >
            ×
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr]">
          <div className="overflow-y-auto border-r border-[#2a3548] bg-[var(--panel)] p-4 text-[13px]">
            <h3 className="mb-2 text-[11px] uppercase tracking-wider text-[var(--muted)]">
              1. Chọn ảnh input
            </h3>
            <div className="grid grid-cols-4 gap-1.5">
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onPickSample(s.id)}
                  className={`flex cursor-pointer flex-col items-center gap-1 rounded border-2 bg-[var(--panel-2)] p-1 transition ${
                    activeSample === s.id
                      ? "border-[var(--accent)] bg-[#1a2c44]"
                      : "border-[#36405a] hover:border-[var(--accent)]"
                  }`}
                >
                  <canvas
                    ref={(el) => {
                      sampleRefs.current[s.id] = el;
                    }}
                    width={64}
                    height={64}
                    className="h-12 w-12 rounded-sm bg-black"
                    style={{ imageRendering: "pixelated" }}
                  />
                  <span className="text-[10px] text-[var(--muted)]">{s.label}</span>
                </button>
              ))}
            </div>
            <label className="mt-2 block cursor-pointer rounded border border-dashed border-[#36405a] bg-[var(--panel-2)] p-2 text-center text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--fg)]">
              📂 Upload ảnh
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={onUpload}
              />
            </label>

            <h3 className="mb-2 mt-4 text-[11px] uppercase tracking-wider text-[var(--muted)]">
              2. Cấu hình mini-UNet
            </h3>
            <div className="flex flex-col gap-1.5 text-xs">
              <ConfigSelect
                label="Base channels"
                value={baseC}
                options={[4, 8, 16]}
                onChange={setBaseC}
              />
              <ConfigSelect
                label="Depth"
                value={depth}
                options={[2, 3, 4]}
                onChange={setDepth}
              />
              <ConfigSelect
                label="Input size"
                value={size}
                options={[48, 64, 96]}
                onChange={setSize}
                fmt={(v) => `${v}²`}
              />
            </div>

            <h3 className="mb-2 mt-4 text-[11px] uppercase tracking-wider text-[var(--muted)]">
              3. Selected input
            </h3>
            <canvas
              ref={previewRef}
              width={128}
              height={128}
              className="block h-32 w-32 rounded border border-[#36405a] bg-[#0b0f17]"
              style={{ imageRendering: "pixelated" }}
            />
            <p className="my-1 min-h-[16px] text-xs text-[var(--muted)]">{status}</p>
            <button
              onClick={run}
              disabled={!sourceRef.current || running}
              className="w-full rounded bg-[var(--accent)] px-3 py-2 text-[13px] font-semibold text-[#0b0f17] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-[#2a3548] disabled:text-[#555f73]"
            >
              ⏵ Run forward pass
            </button>
          </div>
          <div className="overflow-y-auto bg-[#0f1419] p-5">
            <h3 className="mb-2.5 text-[13px] uppercase tracking-wider text-[var(--muted)]">
              Feature maps theo từng stage
            </h3>
            {stages ? (
              <FeatureMapList stages={stages} />
            ) : (
              <p className="text-sm italic text-[var(--muted)]">
                Chưa có gì — chọn ảnh và bấm Run.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigSelect<T extends number>({
  label,
  value,
  options,
  onChange,
  fmt,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (v: T) => void;
  fmt?: (v: T) => string;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[#c9d3e3]">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) as T)}
        className="rounded border border-[#36405a] bg-[var(--panel-2)] px-2 py-1 text-[var(--fg)]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {fmt ? fmt(o) : o}
          </option>
        ))}
      </select>
    </label>
  );
}

function FeatureMapList({ stages }: { stages: Stage[] }) {
  const inH = stages[0].tensor.h;
  return (
    <div className="space-y-3">
      {stages.map((stage, i) => (
        <FeatureMapStage key={i} stage={stage} refSpatial={inH} />
      ))}
    </div>
  );
}

function FeatureMapStage({ stage, refSpatial }: { stage: Stage; refSpatial: number }) {
  const t = stage.tensor;
  const displaySize = Math.max(32, Math.min(96, (t.h / refSpatial) * 96));
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";
    if (stage.label === "input") {
      const wrap = makeChannelWrap("RGB");
      renderRGBChannelToCanvas(
        wrap.canvas,
        t.data,
        t.h,
        t.w,
        displaySize * 1.5,
      );
      el.appendChild(wrap.node);
      ["R", "G", "B"].forEach((name, idx) => {
        const w = makeChannelWrap(name);
        renderChannelToCanvas(w.canvas, t.data, t.h, t.w, idx, displaySize);
        el.appendChild(w.node);
      });
    } else {
      const numToShow = Math.min(t.c, 8);
      for (let ic = 0; ic < numToShow; ic++) {
        const w = makeChannelWrap(`ch${ic}`);
        renderChannelToCanvas(w.canvas, t.data, t.h, t.w, ic, displaySize);
        el.appendChild(w.node);
      }
      if (t.c > numToShow) {
        const more = document.createElement("div");
        more.className = "self-center px-2 text-[11px] text-[var(--muted)]";
        more.textContent = `+ ${t.c - numToShow} more channels`;
        el.appendChild(more);
      }
    }
  }, [stage, t, displaySize]);

  return (
    <div className="rounded-md border border-[#232d3f] bg-[var(--panel)] p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
          {stage.label}
        </span>
        <span className="font-mono text-[11px] text-[var(--muted)]">
          [{t.c} × {t.h} × {t.w}]
        </span>
      </div>
      <div ref={containerRef} className="fm-channel flex flex-wrap items-end gap-1" />
    </div>
  );
}

function makeChannelWrap(label: string) {
  const node = document.createElement("div");
  node.className = "fm-channel flex flex-col items-center gap-0.5";
  const canvas = document.createElement("canvas");
  const lbl = document.createElement("div");
  lbl.className = "font-mono text-[9px] text-[var(--muted)]";
  lbl.textContent = label;
  node.appendChild(canvas);
  node.appendChild(lbl);
  return { node, canvas };
}
