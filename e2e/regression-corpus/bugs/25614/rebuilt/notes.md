# 25614: trend line missing on Stack-100% bar/area chart

**Status: live.** Base `8317274709c`.

## Where the code lives now
The fix `13f589c` (#32620) added `getNormalizedStackedTrendDatas` in `visualizations/lib/trends.js` and called it from the dc.js `LineAreaBarRenderer` whenever the chart was normalized. The ECharts migration (#41395) deleted both. In current code the same step is the first transform in `getTrendLines`, in `frontend/src/metabase/viz-core/echarts/cartesian/model/trend-line.ts`. It runs when `stackable.stack_type === "normalized"` and calls `getNormalizedDatasetTransform` with the stack models remapped to the `*_trend` keys.

July's patch removed `/ total` in the shared `getNormalizedDatasetTransform` (`dataset.ts`). That breaks the bars as well as the trend line, so the trend line and the bars stay in the same units and the line stays visible. That's a different bug, which is why the record marks it mismatched. `dataset.ts` was left alone.

## Mutant (`mutant.patch`)
It deletes the Stack-100% transform entry from the `transformDataset` list in `getTrendLines`, plus the now-unused `getNormalizedDatasetTransform` import. After that, trend values reach ECharts in raw units (such as 30) while the bars are normalized to [0, 1], so the line is plotted far off the 0–100% axis. That's the pre-fix behaviour: before `13f589c`, trend data was never normalized. The bars' normalization in `dataset.ts` still works.

The patch applies cleanly at HEAD (`git apply --check`). With the mutant applied, `model/index.unit.spec.ts` and `model/dataset.unit.spec.ts` still pass (33/33), so the mutant loads and doesn't break the whole module.

## Oracle
There's no trend-line spec at this path on master. The land-and-cull commit `b6c3f328367` (branch `regression-corpus-v2`) added `trend-line.unit.spec.ts` at the old `visualizations/echarts/...` path. It was moved to `viz-core/echarts/cartesian/model/trend-line.unit.spec.ts`, switched to the sibling specs' relative imports (`../../../types`, `../constants/dataset`), with comments removed. The assertions are unchanged. It's recorded as `witness.patch`, source `new` (it isn't on master and isn't July's witness).

Clean HEAD + witness:
```
✓ builds a trend series for each numeric series
✓ normalizes trend values to [0, 1] for a Stack-100% chart
✓ leaves trend values un-normalized when the chart is not Stack-100%
Tests: 3 passed, 3 total
```
Mutant + witness:
```
✕ normalizes trend values to [0, 1] for a Stack-100% chart
  expect(received).toBeCloseTo(expected)  Expected: 0.75  Received: 30
  at trend-line.unit.spec.ts:104:33
Tests: 1 failed, 2 passed, 3 total
```

## Adversarial check
- The test calls the pure model function `getTrendLines`. Nothing renders, and there's no ECharts or DOM involved.
- The failure is a value assertion: the trend value is 30, the raw insight offset, where 0.75 (30 of 40) is expected.
- The two sibling tests still pass, so trend series are still built for each numeric series and the non-normalized path is unchanged. Only the Stack-100% scaling is missing.
- The test gives both insights slope 0, so the trend value is constant across x. That way the assertion checks the normalization, not the regression fit.

## Variants
| patch | change | oracle |
|---|---|---|
| variant-1 | condition `=== "stacked"` instead of `"normalized"` | kill (both value tests fail) |
| variant-2 | `getNormalizedDatasetTransform(stackModels)`, keys not mapped to `*_trend` | kill |
| variant-3 | normalization moved after the y-axis scale transform | survive |

Variant 3 only matters on a non-linear y scale (pow/log), and the witness uses an identity `toEChartsAxisValue`. The main dataset pipeline normalizes before it scales the axis, so a test with a log scale would catch this variant.

## Things that could trip the next person
- The witness is not on master. It only exists on `regression-corpus-v2` and `dev-2347-delete-e2e-repros-that-are-covered-by-unit-tests`, at the old `visualizations/echarts` path, so apply `witness.patch` before running the oracle.
- July's oracle (`dataset.unit.spec.ts` "should return an array of normalized datasets") does not kill this mutant. It covers bar normalization, not the trend line.
- The mutant leaves the `stackModels` parameter unused. There's no `noUnusedParameters` in the tsconfig, so it still type-checks, but lint would flag it.
- No `.cljc` was touched, so there was no cljs rebuild. `target` is still the symlink.
