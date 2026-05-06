import Link from "next/link";
import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { getVisualization, visualizations } from "@/visualizations/registry";

export function generateStaticParams() {
  return visualizations.map((v) => ({ slug: v.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const v = getVisualization(slug);
  if (!v) return { title: "Not found" };
  return { title: `${v.title} · ML Visualization Hub`, description: v.tagline };
}

export default async function VizPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = getVisualization(slug);
  if (!meta) notFound();

  const VisualizationComponent = dynamic(meta.load, {
    loading: () => (
      <div className="flex h-[60vh] items-center justify-center text-sm text-[var(--muted)]">
        Loading {meta.title}…
      </div>
    ),
  });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-[#2a3548] bg-[var(--panel)]/60 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-xs text-[var(--muted)] transition hover:text-[var(--accent)]"
          >
            ← Hub
          </Link>
          <span className="text-[var(--muted)]">/</span>
          <h1 className="text-sm font-semibold text-white">{meta.title}</h1>
          <span className="hidden text-xs text-[var(--muted)] sm:inline">
            — {meta.tagline}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {meta.tags.map((t) => (
            <span
              key={t}
              className="rounded border border-[#2a3548] bg-[var(--panel-2)] px-2 py-0.5 text-[10px] text-[var(--muted)]"
            >
              {t}
            </span>
          ))}
        </div>
      </header>
      <div className="flex-1">
        <VisualizationComponent />
      </div>
    </div>
  );
}
