import type { VisualizationModule } from "./types";

/**
 * To add a new visualization:
 *   1. Create `src/visualizations/<slug>/index.tsx` exporting a default React component.
 *   2. Append a new entry below.
 *   3. Done — it appears on the hub and is reachable at `/viz/<slug>`.
 */
export const visualizations: VisualizationModule[] = [
  {
    slug: "unet",
    title: "U-Net",
    tagline: "Encoder–decoder with skip connections for segmentation.",
    description:
      "Tweak hyperparameters, hover blocks, animate the forward pass, and run a mini-UNet on a real image — all in the browser.",
    tags: ["segmentation", "cnn", "interactive"],
    status: "ready",
    load: () => import("./unet"),
  },
  {
    slug: "playground",
    title: "Visualization Template",
    tagline: "Starter scaffold for new modules.",
    description:
      "A minimal example that shows the contract every visualization module follows. Copy this folder when adding a new one.",
    tags: ["template"],
    status: "wip",
    load: () => import("./playground"),
  },
];

export function getVisualization(slug: string): VisualizationModule | undefined {
  return visualizations.find((v) => v.slug === slug);
}
