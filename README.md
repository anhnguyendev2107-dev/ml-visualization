# ML Visualization Hub

Interactive in-browser visualizations for machine-learning architectures.
Built with **Next.js (App Router)**, **TypeScript**, and **Tailwind CSS** —
no backend, no extra build pipeline beyond `next dev`.

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Architecture

```
src/
├── app/
│   ├── layout.tsx           # global shell + dark theme
│   ├── page.tsx             # hub: lists every visualization
│   ├── globals.css          # design tokens + shared primitives
│   └── viz/[slug]/page.tsx  # dynamic loader for a single visualization
└── visualizations/
    ├── types.ts             # `VisualizationModule` contract
    ├── registry.ts          # add new modules here
    ├── unet/                # full U-Net interactive demo
    └── playground/          # template you copy from
```

The hub never imports visualizations directly — it only knows about the
**registry**, which lazy-loads each module via `next/dynamic` at route time.

## Add a new visualization

1. **Copy the template:**
   ```bash
   cp -R src/visualizations/playground src/visualizations/my-thing
   ```

2. **Edit `src/visualizations/my-thing/index.tsx`** — default-export a React
   component. Use `"use client"` whenever you need hooks, canvas, SVG, or
   window APIs.

3. **Register it** in `src/visualizations/registry.ts`:
   ```ts
   {
     slug: "my-thing",
     title: "My Thing",
     tagline: "One-line pitch.",
     description: "What the user will play with.",
     tags: ["cnn", "interactive"],
     status: "wip",
     load: () => import("./my-thing"),
   },
   ```

4. **Done.** It appears as a card on `/` and is reachable at `/viz/my-thing`.
   Static params are generated at build time so each visualization gets its
   own pre-rendered route.

## Conventions

- Pure math/algorithms go in sibling files (`math.ts`, `mini-unet.ts`, …);
  keep React components thin.
- Use the design tokens in `globals.css` (`--accent`, `--panel`, `--muted`, …)
  and the `viz-card` / `viz-shape-pill` utility classes for visual consistency.
- Prefer Tailwind utility classes for layout. Drop module-specific CSS into
  `globals.css` only when you need keyframes or complex SVG styling.
