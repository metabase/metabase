Both the product mutation and the witness are left in the worktree. Task complete.

---

## Report: issue 60475 — witness_authored

### 1. git diff (product mutation)
Semantic revert of the load-bearing product change in `frontend/src/metabase/visualizations/echarts/cartesian/option/ticks.ts` — removed the monthly-ticks HACK block from `getTicksOptions`:

```diff
-  // HACK: For monthly ticks, we need to handle variable month lengths.
-  // ...
-  if (largestInterval.unit === "month") {
-    canRender = (date: Dayjs) =>
-      isWithinRange(date) &&
-      date.date() === 1 &&
-      date.month() % largestInterval.count === 0;
-    maxInterval = getTimeSeriesIntervalDuration({ count: 1, unit: "day" });
-  }
```

With the block gone, month intervals fall through to the default `if (!maxInterval) minInterval = getTimeSeriesIntervalDuration(largestInterval)` — i.e. a fixed **month-duration `minInterval`** and a `canRender` that is only the in-range check. This is exactly the pre-fix behavior.

The fix commit touched 3 files (pf=2 product-ish): the `.png` Loki snapshot (regen artifact, not load-bearing) and the e2e spec (test). `ticks.ts` is the sole load-bearing product change.

### 2. Witness
New file: `frontend/src/metabase/visualizations/echarts/cartesian/option/ticks.unit.spec.ts` (added, left applied).

It builds a 12-month `TimeSeriesXAxisModel` (Jan–Dec 2025, month bucket) plus a wide mock `ChartLayout` (tiny `getXTickWidth` so the computed tick interval stays monthly), calls the exported `getTicksOptions`, and asserts:
- `maxInterval === day duration (86400000)` and `minInterval === undefined` (fix forces daily ticks)
- `canRender(2025-06-01) === true`, `canRender(2025-06-15) === false` (only month-starts render)

Oracle command:
```
bun run test-unit-keep-cljs frontend/src/metabase/visualizations/echarts/cartesian/option/ticks.unit.spec.ts
```
- **PASS on clean HEAD** (1 passed).
- **FAIL on mutant**, clean assertion (not a compile error): `expect(maxInterval).toBe(86400000)` → `Received: undefined`.

### 3. Bug summary
For a bar/line chart of 12 months of timeseries data, ECharts is driven by a fixed monthly `minInterval`. Because calendar months have unequal durations (Feb 28 days vs. 31), ECharts' even-spacing tick placement skips some months, so the x-axis is missing labels. The e2e repro asserts ≥12 visible middle-anchored axis labels. The fix instead generates daily ticks (`maxInterval = 1 day`) and filters `canRender` to `date.date() === 1`, guaranteeing one tick per month start.

### 4. Outcome
`witness_authored` — the bug is unit-catchable. `getTicksOptions` is an exported, near-pure function; the mutation flips its returned `minInterval`/`maxInterval`/`canRender` in a way a jsdom-free jest assertion discriminates directly. The e2e is replaceable by this unit test.

### 5. Confidence
High. The mutation is a faithful behavioral revert — it reproduces the exact `minInterval=month`/`maxInterval=undefined` code path that the fix's comment blames for skipped months. The witness discriminates on the same seam the fix changed (the tick-driving options and the month-start filter), and fails on the mutant with a value assertion, not a compile/throw. No browser geometry needed: the "missing labels" symptom reduces cleanly to the returned tick-option values.