# 63671: a single-year bar chart labels its year twice

**Status: live.** Base `8317274709c`. The mutated file is `frontend/src/metabase/viz-core/echarts/cartesian/option/ticks.ts`.

## Where the code moved
In July the file was `frontend/src/metabase/visualizations/echarts/cartesian/option/ticks.ts`. `a0d5c5a0c79` (Create the viz-core module, #80786) moved it to `viz-core/`. The body is unchanged apart from the dayjs facade import, so the July patch is stale only because of the path.

## What the mutant does and why it's the same bug
The fix `e50317d86dd` changed `getPadding` from `intervalsCount === 1` to `<= 1`. Then the ECharts 6.1.0 upgrade (`6bf214f2c23`, #75139) added a `largestInterval.unit === "year"` branch that limits `canRender` to 1 January ticks, and its comment cites this issue. Under ECharts 6.1, that branch is what prevents the duplicate, not the padding. The mutant deletes the branch, as July's did. A single-point year domain then falls back to `isWithinRange` alone. Any mid-year tick ECharts emits inside the padded domain passes `canRender`. It formats as "2025", so the axis shows the year twice, which matches `bug.statement` and the e2e assertion `findByText("2025").should("have.length", 1)`.

## Oracle (new, added to the existing `ticks.unit.spec.ts`)
July's witness built a hand-rolled `TimeSeriesXAxisModel` and checked `canRender` on its own. I replaced it with a test in the existing spec's `describe`. The test builds the real model through `getXAxisModel` from a one-row year-bucketed bar dataset. It then does what `buildTimeSeriesDimensionAxis`'s `axisLabel.formatter` does to two candidate ticks, 2025-01-01 and 2025-07-01: `fromEChartsAxisValue`, then `canRender`, then `formatter`. It asserts that the rendered labels are `["2025"]`.

Clean HEAD:
```
PASS core .../option/ticks.unit.spec.ts
  ✓ should align padded domain ... (#56580)
  ✓ should label a single-year x-axis only once (metabase#63671)
```
Mutant:
```
✕ should label a single-year x-axis only once (metabase#63671)
  expect(received).toEqual(expected)
    Array [ "2025", +   "2025", ]
  at ticks.unit.spec.ts:98:20
```

## Adversarial check
- This is a value assertion on the label list, not a crash. The sibling #56580 test in the same file still passes on the mutant.
- On the mutant, `option/index.unit.spec.ts`, `option/series.unit.spec.ts` and `model/axis.unit.spec.ts` pass (36/36), so the mutant doesn't break everything.
- Variant 2 turns the failure into `[]`. So the test checks both halves: the real tick survives and the extra one is dropped.

## Variants
1. `!isSingleItem && unit === "year"` (the quarter branch's guard, copied over): **kill** (`["2025","2025"]`).
2. `date.month() === 1` (treating dayjs months as 1-based): **kill** (`[]`).
3. `getPadding` back to `intervalsCount === 1` (the literal 2025 fix reverted): **survive**. With 0.5 padding, 2025-07-01 is still inside the padded domain, and the year guard rejects it anyway. The existing #56580 test survives too, because it recomputes padding through `getPadding`. Whether this revert shows anything in a browser under ECharts 6.1 depends on ECharts' own tick picking, which jest can't see.

## Gotchas for the next person
- The test simulates the ticks ECharts would emit. It doesn't run ECharts. If a future ECharts stops emitting mid-year ticks, the mutant becomes invisible in the browser but still fails here. The test pins the `canRender` contract, not ECharts' behaviour.
- `fix_tests` in `record.yaml` keeps July's test names at the old `visualizations/echarts` path. The oracle for this mutant is `getTicksOptions should label a single-year x-axis only once (metabase#63671)` in `viz-core/echarts/cartesian/option/ticks.unit.spec.ts`, which is what `hint.test` names.
- There's no `.cljc` involved, so no CLJS rebuild was needed. The `target` symlink was left as is.
