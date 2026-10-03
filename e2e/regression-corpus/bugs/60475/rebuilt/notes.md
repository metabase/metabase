# 60475: 12-month bar chart skips month labels

Status: live. Base 8317274709c, worktree /private/tmp/metabase-corpus-r60475.

## Where the code moved
Fix cf9868d5098 (#67316) added a `largestInterval.unit === "month"` block to `getTicksOptions` in
`frontend/src/metabase/visualizations/echarts/cartesian/option/ticks.ts`. The viz-core module
(a0d5c5a0c79, #80786) moved it to `frontend/src/metabase/viz-core/echarts/cartesian/option/ticks.ts`.
The block is still there. #70814 (027a2bede14) later added `date.month() % largestInterval.count === 0`
to its `canRender`, which is why July's patch doesn't apply cleanly.

## Mutant
Removed the whole month block (15 lines). Month ticks now fall through to
`if (!maxInterval) minInterval = getTimeSeriesIntervalDuration(largestInterval)`, so ECharts gets a
fixed 31-day `minInterval` and `canRender` is only the in-range check. That's the code as it was
before the fix, and it's the path the fix comment blames for skipped months (February is shorter than
31 days, so ECharts' evenly spaced ticks step over it). The rest of the function is untouched.
The option specs next to it (index, series, and the other ticks test, 28 tests) still pass on the
mutant, so the module loads fine.

## Oracle (new, adapted from July's witness.patch)
New `it` in the existing `ticks.unit.spec.ts`. It builds a real `TimeSeriesXAxisModel` through
`getXAxisModel` (12 monthly rows, Jan to Dec 2025, month-unit datetime column, bar display) instead of
July's hand-built model, then calls `getTicksOptions` with `createMockChartLayout({ outerWidth: 1200 })`.
The chart is wide enough that the computed tick interval stays at 1 month. Assertions:
`minInterval` undefined, `maxInterval` is 1 day, every month start passes `canRender` (taken through
`toEChartsAxisValue`/`fromEChartsAxisValue`, the same round trip the axis label formatter makes), and
2025-02-15 does not.

Clean: `✓ should give every month of a 12-month series a tick label (metabase#60475)`, 2 passed.
Mutant:
    ✕ should give every month of a 12-month series a tick label (metabase#60475) (4 ms)
    expect(received).toBeUndefined()
    Received: 2678400000
    at ticks.unit.spec.ts:99:25

## Adversarial check
The failure is a value assertion on the returned `minInterval`, which is exactly 31 days: the fixed
month interval the bug hands to ECharts. It isn't a render crash, because nothing is rendered. The
sibling test in the same file still passes on the mutant, so the module imports and runs. The oracle
doesn't prove that ECharts drops a label (that needs a real ECharts layout). It proves the function
goes back to the tick options that caused the dropped labels, which is the unit-level version of the bug.

## Variations
- variant-1: keep the month-start filter but drop `maxInterval = 1 day`. The fallback sets a 31-day
  `minInterval`. Kill (same assertion).
- variant-2: drop the `date.month() % count` term. This only matters for 2-month tick spacing, and 12
  months at 1200px keep 1-month ticks. Survive.
- variant-3: guard on `interval.unit` (data) instead of `largestInterval.unit` (ticks). With monthly
  data both are "month", so the result is the same. Weekly or daily data with monthly ticks would break
  instead. Survive.

## Watch out for
- The deleted e2e filters to "last 12 months" of sample data relative to now, so it can fail on clean
  code once the sample data dates fall behind. The unit oracle doesn't depend on dates.
- `target` is a symlink to the shared build. No .cljc was touched and no cljs rebuild was needed.
- The model is built with the default results timezone. The existing US/Samoa test in the same file
  shows that timezone shifts the axis values, so if you add a timezone to this test, check that the
  month starts still land on `date() === 1` after the round trip.
