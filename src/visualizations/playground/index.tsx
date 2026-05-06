"use client";

/**
 * Template visualization. Copy this folder under `src/visualizations/<your-slug>/`
 * and register it in `../registry.ts`.
 *
 * The default export is rendered inside `/viz/<slug>` and receives the full
 * page area below the global header. Keep the component "use client" if you
 * need React hooks, canvas, SVG, or window APIs.
 */
export default function PlaygroundVisualization() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="viz-card p-8">
        <h2 className="text-xl font-semibold text-white">
          Template visualization
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This file lives at{" "}
          <code className="rounded bg-black/40 px-1.5 py-0.5 text-[12px]">
            src/visualizations/playground/index.tsx
          </code>
          . Replace the JSX below with your interactive demo.
        </p>

        <ol className="mt-6 space-y-2 text-sm leading-relaxed text-[#c9d3e3]">
          <li>
            <span className="text-[var(--accent)]">1.</span> Duplicate this folder
            and pick a slug.
          </li>
          <li>
            <span className="text-[var(--accent)]">2.</span> Add an entry to{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-[12px]">
              registry.ts
            </code>{" "}
            with your title, tagline, tags, and a dynamic{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-[12px]">
              load
            </code>{" "}
            import.
          </li>
          <li>
            <span className="text-[var(--accent)]">3.</span> Build whatever you
            want — Tailwind classes and the shared{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-[12px]">
              viz-card
            </code>{" "}
            primitives are already available in{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-[12px]">
              globals.css
            </code>
            .
          </li>
        </ol>
      </div>
    </div>
  );
}
