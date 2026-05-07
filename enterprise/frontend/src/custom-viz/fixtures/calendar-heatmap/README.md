# Calendar Heatmap fixture

Minimal `mount`-based custom-viz used by the Storybook/Loki visual tests at
[`frontend/test/__support__/custom-viz-fixtures/`](../../../../../../frontend/test/__support__/custom-viz-fixtures/).

It is intentionally tiny: no React, no echarts, no third-party deps.
Vanilla DOM/SVG keeps the rendering deterministic for snapshots and
keeps the fixture diff readable.

## Why this bypasses the production loader

The production custom-viz loader (`loadCustomVizPlugin` in
[`custom-viz-plugins.tsx`](../../metabase-enterprise/custom_viz/custom-viz-plugins.tsx))
fetches a plugin bundle and evaluates it inside `@locker/near-membrane-dom`.
That sandbox is designed to isolate untrusted plugin bytes from the host
page — it's not a useful contract to drag a Storybook fixture through, and
it costs us flaky waits + a 1MB+ pre-built bundle in the test tree.

This fixture is imported as a normal ESM module by
[`calendar-heatmap-fixtures.ts`](../../../../../../frontend/test/__support__/custom-viz-fixtures/calendar-heatmap-fixtures.ts)
and registered via `registerVisualization` directly, skipping the fetch
and the membrane. The story snapshot only cares about the rendered
output, so this is the right level to test at.

## Editing

Just edit [`src/index.ts`](./src/index.ts) — there's no build step. The
storybook bundler picks up the source on the next dev-server reload.
