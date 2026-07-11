Both the product mutation and the witness are left in the worktree. Task complete.

## Report

### 1. git diff (product mutation)
`frontend/src/metabase/visualizations/echarts/cartesian/option/ticks.ts` — removed the year-boundary guard inside `getTicksOptions`:

```diff
-  // HACK: ECharts 6.1.0 emits intermediate (mid-year) ticks within the padded
-  // single-point year domain. Unlike week/month/quarter, the year path had no
-  // boundary guard, so two ticks in the same year both format as that year and
-  // duplicate the label (metabase#63671). Filter to start-of-year ticks only.
-  if (largestInterval.unit === "year") {
-    canRender = (date: Dayjs) =>
-      isWithinRange(date) && date.month() === 0 && date.date() === 1;
-  }
```

**Load-bearing change identification (multi-file / drift):** The fix commit `e50317d` changed `getPadding` (`intervalsCount === 1` → `<= 1`) plus a Loki `.png` snapshot (that's the `pf=2`). But the code has since drifted: the ECharts 6.1.0 upgrade (`6bf214f2c23`) added the `year` boundary guard shown above, which is now the actual mechanism preventing the duplicate label under ECharts 6.1.0. I verified the `getPadding` revert alone does **not** reintroduce the bug in current code — with the year block present, `canRender` still filters the single-year domain down to only `2025-01-01`. The year block is therefore the load-bearing change, and removing it is the faithful semantic reintroduction.

### 2. Witness
Added `frontend/src/metabase/visualizations/echarts/cartesian/option/ticks.unit.spec.ts`. It builds a minimal single-point year domain model (bar chart by year, filtered to 2025) and asserts on `getTicksOptions(...).canRender` — the pure seam the fix modifies:
- `canRender(2025-01-01)` → `true` (the real start-of-year tick renders)
- `canRender(2025-07-01)` → `false` (mid-year tick rejected, so "2025" isn't duplicated)

Oracle command: `bun run test-unit-keep-cljs frontend/src/metabase/visualizations/echarts/cartesian/option/ticks.unit.spec.ts`

- **PASS on clean HEAD:** both tests pass.
- **FAIL on mutant:** the mid-year test fails cleanly: `expect(received).toBe(expected)` — `Expected: false, Received: true`. The start-of-year test still passes, confirming the discrimination is specific to the filter.

### 3. Bug summary
On a bar chart aggregated by year and filtered to a single year (single-point domain), ECharts 6.1.0 emits an intermediate mid-year tick inside the padded domain. Without the boundary guard, that tick passes `canRender` (it's within range) and formats as the same year — so the x-axis shows the year label ("2025") twice. The e2e asserts `findByText("2025").should("have.length", 1)`.

### 4. Outcome
**witness_authored** — the bug is unit-catchable. `getTicksOptions` is a near-pure function returning `canRender`, and the mutation's observable effect (whether a mid-year date is allowed as a tick) is directly assertable in jsdom without any real-browser render, ECharts layout, or routing. The e2e is replaceable by this unit test.

### 5. Confidence
High. The mutation removes exactly the guard whose own comment cites metabase#63671, and the witness targets the same `canRender` predicate the guard rewrites. The witness discriminates cleanly (value assertion, not a compile/throw), the sibling "start-of-year renders" assertion holds on both clean and mutant (proving the test isn't just globally broken by the edit), and I confirmed the alternative candidate mutation (`getPadding` revert) does not reproduce the bug under current ECharts — so this is the correct load-bearing seam.