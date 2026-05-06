import Link from "next/link";
import { visualizations } from "@/visualizations/registry";

const STATUS_STYLES: Record<string, string> = {
  ready: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  wip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  experimental: "bg-violet-500/15 text-violet-300 border-violet-500/30",
};

export default function HubPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">
          ML Visualization Hub
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          A growing collection of interactive visualizations for machine-learning
          architectures. Each module lives in{" "}
          <code className="rounded bg-black/40 px-1.5 py-0.5 text-[12px]">
            src/visualizations/&lt;slug&gt;/
          </code>{" "}
          and is registered in{" "}
          <code className="rounded bg-black/40 px-1.5 py-0.5 text-[12px]">
            registry.ts
          </code>
          .
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visualizations.map((v) => (
          <Link
            key={v.slug}
            href={`/viz/${v.slug}`}
            className="viz-card group flex flex-col gap-3 p-5 transition hover:border-[var(--accent)] hover:shadow-[0_8px_30px_rgba(88,166,255,0.12)]"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{v.title}</h2>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                  STATUS_STYLES[v.status] ?? STATUS_STYLES.experimental
                }`}
              >
                {v.status}
              </span>
            </div>
            <p className="text-sm text-[var(--accent)]">{v.tagline}</p>
            <p className="text-sm leading-relaxed text-[var(--muted)]">
              {v.description}
            </p>
            <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
              {v.tags.map((t) => (
                <span
                  key={t}
                  className="rounded border border-[#2a3548] bg-[var(--panel-2)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
                >
                  {t}
                </span>
              ))}
            </div>
            <span className="mt-1 text-xs text-[var(--accent)] opacity-0 transition group-hover:opacity-100">
              Open visualization →
            </span>
          </Link>
        ))}
      </div>

      <footer className="mt-16 border-t border-[#2a3548] pt-6 text-xs text-[var(--muted)]">
        Built with Next.js · App Router · Tailwind CSS. See{" "}
        <code className="rounded bg-black/40 px-1.5 py-0.5">README.md</code> for
        how to add a new visualization.
      </footer>
    </main>
  );
}
