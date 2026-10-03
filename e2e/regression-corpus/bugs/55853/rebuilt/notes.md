# 55853: low percentages collide with the y-axis title

## Where the code moved
Fix `b99d3d186dd` (#67219) edited `visualizations/echarts/cartesian/chart-measurements/index.ts`.
July found it at `visualizations/echarts/cartesian/layout/index.ts`. At `8317274709c` it lives at
`frontend/src/metabase/viz-core/echarts/cartesian/layout/index.ts`, in `getYAxisTicksWidth`
(the `valuesToMeasure.map` callback, around line 203). The function body is unchanged apart
from the move, so July's hunk is right and only the path is stale.

## Mutant
Brings back the module-level `roundToHundredth = (v) => Math.ceil(v * 100) / 100` and the
`if (isPercent) value = roundToHundredth(rawValue); else if (!areDecimalTicksExpected) ...`
branch that the fix removed. This is the fix diff inverted line for line. Percent values
are rounded up to the next hundredth before formatting, so 0.0002 ("0.02%") gets measured
as 0.01 ("1.00%" with the test formatter, "1%" in the product). Under-measuring the labels
reserves too little left padding, and the real labels run into the axis title, which is
what the e2e checked in pixels.

## Oracle
No 55853 unit test exists on master. I took July's `witness.patch`, moved it to the new spec
path (`layout/index.unit.spec.ts`), reused the file's `WIDEST_MEASURED_TICK_WIDTH` constant and
dropped July's inline comment. It builds a percent axis with extent `[0, 0.0002]`, stubs
`measureText` to return 64 only for `"0.02%"`, and calls the exported `getChartLayout`.

Clean HEAD:
    ✓ measures actual y-axis tick labels for a zero-pinned axis (#74568)
    ✓ measures the actual low-percentage tick labels instead of rounded ones (metabase#55853)
    Tests: 2 passed, 2 total

Mutant:
    ✕ measures the actual low-percentage tick labels instead of rounded ones (metabase#55853)
    Expected: "0.02%", Anything
    Received 1: "1.00%" ... 3: "1.00%"   (6 calls, only "1.00%"/"0.00%")
    Tests: 1 failed, 1 passed, 2 total

## Adversarial check
The failure is a `toHaveBeenCalledWith` mismatch, not a throw. The module loads, and the sibling
#74568 test runs through the same `getChartLayout` path and still passes on the mutant.
The received calls show the rounded strings the bug produces. The second assertion
(`yTicksWidthLeft === 64 + axisTicksMarginY`) would also fail on the mutant (20 + margin),
so the test covers both which label gets measured and how much width is reserved.

## Variants (oracle = the 55853 test)
- variant-1, `isPercent || !areDecimalTicksExpected` (percent rounded to integers): kill.
- variant-2, `!isPercent` guard dropped: survive. It only matters for percent axes whose
  extent leaves (-5, 5), and the witness extent is tiny.
- variant-3, max dropped from `getValuesToMeasure`: survive. The 0.00016 middle value still
  formats to "0.02%" under the `toFixed(2)` formatter.

## Watch out for
- The witness formatter is a stand-in (`(v*100).toFixed(2)%`), not Metabase's real percent
  formatting. Every label it produces has the same length, so a length-proportional
  `measureText` stub would NOT catch the mutant. The string-keyed stub is what gives the
  test its power.
- No `.cljc` touched and no cljs rebuild needed. The worktree's `target` is still a symlink.
- Jest ran quickly here (about 3 to 11 s per run) even with other test runs on the machine.
