# Custom-viz fixtures

Sources for the custom-viz plugin fixtures used by Metabase tests. Each
fixture has its own subdirectory with a typed source so we can rebuild
on demand whenever the plugin contract drifts.

## Layout

```
fixtures/
├── build-all.mjs          # rebuilds the e2e .tgz fixtures from source
├── calendar-heatmap/      # Storybook/Loki snapshot fixture
│   └── src/index.ts       # imported directly, no bundle needed
└── demo-viz/              # e2e fixture (uploaded as a .tgz tarball)
    ├── manifests/
    │   ├── demo-viz.json    # → example_custom_viz_plugin.tgz
    │   └── demo-viz-2.json  # → example_custom_viz_plugin_2.tgz
    ├── public/thumbs.svg
    └── src/index.tsx
```

## Why two paths

| | calendar-heatmap | demo-viz |
|---|---|---|
| Consumer | Storybook / Loki | Cypress e2e |
| Loaded via | direct `registerVisualization` | full `loadCustomVizPlugin` (sandbox + fetch) |
| Bundled? | no — imported as ESM | yes — IIFE with React inlined |
| Why | snapshots only care about the rendered pixels; the membrane adds flake without testing anything we care about | e2e is the place that *should* exercise the upload → fetch → membrane pipeline |

## Rebuild

```bash
# Storybook fixture: nothing to do — sources are imported directly.

# E2E fixtures:
bun run build:custom-viz-fixtures
```

The e2e build emits both `.tgz` files into
[`e2e/support/assets/`](../../../../../e2e/support/assets/). The bundle
inside both tarballs is identical; only the manifest differs (this
mirrors the previous hand-built fixtures).

## When to rebuild

- The `mount` / `defineConfig` / `CreateCustomVisualization` contract
  changes in [`../src/types/`](../src/types/).
- A new e2e test needs a new `data-testid` or behavior on the demo viz.
  Edit `demo-viz/src/index.tsx`, rebuild, commit the new `.tgz`.
