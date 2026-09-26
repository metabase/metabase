Both the mutation and witness are in place and verified. Here is the report.

## E2E-only reconstruction + witness — issue 55853

### 1. git diff (product mutation)
The fix commit `b99d3d18` lived in `chart-measurements/index.ts`, which has since moved to `frontend/src/metabase/visualizations/echarts/cartesian/layout/index.ts` (function `getYAxisTicksWidth`). Semantic revert reintroduces the `roundToHundredth` step applied to percent values before width measurement:

```diff
+  const roundToHundredth = (value: number) => Math.ceil(value * 100) / 100;
+
   const measuredValues = valuesToMeasure.map((rawValue) => {
     let value = rawValue;
-    if (!isPercent && !areDecimalTicksExpected) {
+    if (isPercent) {
+      value = roundToHundredth(rawValue);
+    } else if (!areDecimalTicksExpected) {
       value = Math.round(rawValue);
     }
```

This is the exact inverse of the shipped fix, adapted to the drifted location.

### 2. Witness
Added to the existing `.../layout/index.unit.spec.ts` (new `it(...metabase#55853)`). It builds a percent-formatted y-axis with extent `[0, 0.0002]`, mocks `measureText` to return a wide width only for the true label `"0.02%"`, and calls the exported `getChartLayout`.

- Oracle command: `bun run test-unit-keep-cljs frontend/src/metabase/visualizations/echarts/cartesian/layout/index.unit.spec.ts`
- PASS on clean HEAD: 2 passed. The real max label `"0.02%"` is measured, so `yTicksWidthLeft === WIDE + axisTicksMarginY`.
- FAIL on mutant: assertion `expect(measureText).toHaveBeenCalledWith("0.02%", ...)` fails — the mutant instead measures the rounded `"1.00%"` (received calls all `"1.00%"`/`"0.00%"`), so the un-rounded low-percentage label is never measured.

### 3. Bug summary
For a percent-formatted column with very low values (lots of decimals, e.g. `0.0001`–`0.00025` → `"0.01%"`, `"0.025%"`), the buggy code rounds each raw value up to the nearest hundredth (`Math.ceil(v*100)/100`) *before* formatting it to measure the y-axis tick width. Rounding turns a long label like `"0.02%"` into the much shorter `"1.00%"`, so the reserved y-axis width is under-measured. At render time the actual multi-decimal percentage labels are wider than the reserved space and collide with the y-axis / axis title — exactly what the e2e checks (label-left minus title-right > 5px).

### 4. Outcome
`witness_authored` — the bug is unit-catchable. The e2e's geometric overlap check reduces to a pure computed-layout value: the pixel width `getYAxisTicksWidth` reserves is driven entirely by which formatted string is fed to the injectable `measureText`. The mutation changes *which string* gets measured, and that is observable at the unit level via the already-exported `getChartLayout` seam (no real browser layout needed). The e2e's "very low percentages collide with y-axis" is a real-pixel symptom, but its root cause is a unit-testable layout computation.

### 5. Confidence
High. The mutation is a faithful line-for-line semantic inverse of the shipped fix. The witness discriminates cleanly (behavioral assertion + width assertion), fails on the mutant with a clear message (not a compile error), and passes on clean HEAD alongside the pre-existing sibling test. The seam (`measureText` injection through `RenderingContext`) is the same one the adjacent `#74568` test already exercises, so the pattern is idiomatic and stable.

Files:
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-ab2873768a5fe0f0c/frontend/src/metabase/visualizations/echarts/cartesian/layout/index.ts` (mutation, left applied)
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-ab2873768a5fe0f0c/frontend/src/metabase/visualizations/echarts/cartesian/layout/index.unit.spec.ts` (witness)