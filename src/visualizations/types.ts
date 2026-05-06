import type { ComponentType } from "react";

/**
 * Metadata + lazy component for a single visualization module.
 * Add a new entry to `registry.ts` to expose a new visualization.
 */
export interface VisualizationModule {
  /** URL slug, also the folder name under `src/visualizations/`. */
  slug: string;
  /** Short title shown in the hub and page header. */
  title: string;
  /** One-line tagline. */
  tagline: string;
  /** Longer markdown-free description used on cards. */
  description: string;
  /** Topic tags for filtering / display. */
  tags: string[];
  /** Status of the module — used to badge cards. */
  status: "ready" | "wip" | "experimental";
  /** Lazy-loaded React component rendering the visualization. */
  load: () => Promise<{ default: ComponentType }>;
}
