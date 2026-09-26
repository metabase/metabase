# 59671: removing a line/bar chart's dimension breakout crashes the chart

Status: **failed, masked by a later fix** (d43c0a418b4, #61180, which reapplied #60892). Base `8317274709c`. No oracle, no variants, no witness.

## Where the code is now
The fix (9e7943aeb5b, #59740) wrapped `model.dimensionModel.column.display_name = tc(...)` in `if (model.dimensionModel.column)`. The guard is still in `frontend/src/metabase/visualizations/visualizations/CartesianChart/use-models-and-option.ts:90`. The chart model it guards moved to `metabase/viz-core` (`echarts/cartesian/model`, `lib/graph/columns.ts`, `shared/settings/cartesian-chart.ts`). July's patch conflicts only because the timeline-event code around the guard was rewritten; the guard itself is unchanged.

## Why the guard can't fire at HEAD
Two later changes each stop the pre-fix state, `dimensionModel.column === undefined`, from reaching the hook:
1. d43c0a418b4 (#61180; the filter was reshaped by c3715127e2c, #68903): `getDefaultDimensions` drops dimension names that aren't in the result columns. A card left with `graph.dimensions: ["CREATED_AT"]` and cols `[count]` computes to `[null]`, so `checkRenderable` throws `ChartSettingsError`. `Visualization` then renders `visualization-placeholder` and never mounts the chart.
2. 044323c (#66786): `getColumnDescriptors` now skips names it can't find instead of returning `{index: -1, column: undefined}`. A missing dimension leaves `cardsColumns[0].dimension` undefined, and `getDimensionModel` throws at `series.ts:340` (`reading 'column'`) before the hook reaches the guard. Every descriptor it does return has a defined column, so `dimensionModel.column` is always defined once `getModel` returns. `DimensionModel.column` is also typed non-optional.

## What I ran (scratch jest probe, deleted afterwards)
Input: line and bar cards with `graph.dimensions ["CREATED_AT"]`, `graph.metrics ["count"]`, cols `[count]`, one row, which is the e2e's state after removing `Created At: Month`.
- Clean HEAD: computed dims `[null]`; full `Visualization` shows the placeholder; calling the hook directly with those settings throws `TypeError ... (reading 'column')` at `viz-core/echarts/cartesian/model/series.ts:340`.
- Guard removed (`mutant.patch`): identical on every probe. It is an equivalent mutant.
- Only the #61180 filter removed: dims `[]`, still the placeholder, because c3715127e2c's `columnsAreValid` check in `canReusePrevious` also blocks it.
- `getDefaultDimensions` restored to its pre-#61180 body: dims stay `["CREATED_AT"]` and the chart shows "Cannot read properties of undefined (reading 'column')". It still throws at `series.ts:340` with the 59671 guard in place. The user-visible crash comes back, but it's the #60892/#61180 bug, not this one.

To get the June 2025 crash at the guard with the guard doing real work, you would have to revert #61180 (and #68903's check) and also #66786. That means bringing back other fixed bugs, so per the brief this is reported as failed rather than forced.

## Adversarial check
July's witness only kills the guard-removal mutant because it mocks `getCartesianChartModel` to set `dimensionModel.column = undefined`, a state the real model can't produce at HEAD. It also fails only by crashing (a TypeError thrown from `renderHook`), not on an assertion. I didn't adopt it: it would have made the mutant look live when nothing a user can reach changes.

## Files
- `mutant.patch`: the exact inverse of the fix at HEAD, kept as the attempted mutant. It applies cleanly and is equivalent at HEAD. Don't register it as live.
- `result.json`: `status: failed`, with the probe outcomes under `probe`.

## Traps
- `getComputedSettingsForSeries` now comes from `metabase/viz-core`; the old `metabase/visualizations/lib/settings/visualization` path is gone.
- The hook imports the model from the `metabase/viz-core` barrel, so a `jest.mock` of the old `metabase/visualizations/echarts/cartesian/model` path won't intercept it.
- Rendering this series logs caught `Error getting setting graph.x_axis.*` warnings on clean HEAD. They're harmless.
- For the e2e deletion question: what the 59671 e2e checks (no crash after removing the breakout) now depends on the #61180 settings filter, not on the 59671 guard.
