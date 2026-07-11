Done. Both the mutation and witness are in place and verified.

## Report

### 1. git diff (product mutation)
Semantic revert of fix commit `9e7943a` in the current tree — removes the null guard so the hook again reads `.display_name` off a possibly-undefined dimension column:

```diff
--- a/frontend/src/metabase/visualizations/visualizations/CartesianChart/use-models-and-option.ts
+++ b/frontend/src/metabase/visualizations/visualizations/CartesianChart/use-models-and-option.ts
@@ -87,11 +87,9 @@ export function useModelsAndOption(
       gridSize,
     );
 
-    if (model.dimensionModel.column) {
-      model.dimensionModel.column.display_name = tc(
-        model.dimensionModel.column.display_name,
-      );
-    }
+    model.dimensionModel.column.display_name = tc(
+      model.dimensionModel.column.display_name,
+    );
     return model;
```

### 2. Witness
Added `frontend/src/metabase/visualizations/visualizations/CartesianChart/use-models-and-option.witness.unit.spec.tsx`. It drives the real `useModelsAndOption` hook via `renderHookWithProviders`, with `getCartesianChartModel` mocked to return a fully-valid model that has `dimensionModel.column` stripped to `undefined` — the exact runtime shape the model had before the fix. Assertion: `result.current.chartModel` is defined and its `dimensionModel.column` is undefined.

Oracle command:
```
bun run test-unit-keep-cljs frontend/src/metabase/visualizations/visualizations/CartesianChart/use-models-and-option.witness.unit.spec.tsx
```
- PASS on clean HEAD (guard present): 1 passed.
- FAIL on mutant (guard removed): `TypeError: Cannot read properties of undefined (reading 'display_name')` at the mutation site (line 91).

### 3. Bug summary
When a line/bar chart's `graph.dimensions` still names a column that is no longer present in the query results (the e2e removes the `Created At: Month` breakout from a count aggregation), the chart model's `dimensionModel.column` is `undefined`. The hook unconditionally did `model.dimensionModel.column.display_name = tc(...)`, throwing inside the render `useMemo`, which the `ChartRenderingErrorBoundary` surfaces as a crashed visualization. The fix wrapped that write in an `if (model.dimensionModel.column)` guard.

### 4. Outcome
`witness_authored` — the bug is unit-catchable. The crash is a pure JS TypeError inside a hook `useMemo`; no browser layout/geometry, routing, or real network is involved, so a jsdom `renderHook` discriminates clean vs mutant cleanly.

### 5. Confidence
- Mutation faithfulness: high. It is the precise inverse of the fix commit's product change, at the same line, producing the exact error string the e2e guards against.
- Witness faithfulness: high but note one drift caveat worth recording. The fix commit's crash site (the hook) is no longer reachable through the natural product path in current code: a later commit (`044323c` / #66786, Dec 2025) hardened `getColumnDescriptors` to skip missing columns, and the settings/`checkRenderable` path (`validateChartDataSettings`) now sanitizes an invalid dimension to an empty set and shows a "Which fields…" empty state before the chart ever renders. I verified this empirically — feeding the raw degenerate series (`cols:[count]`, `graph.dimensions:["CREATED_AT"]`) to `getCartesianChartModel` now throws *upstream* in `getDimensionModel` (`cardsColumns[0].dimension.column`), not at the hook. Because of this, the hook guard is effectively dead code against natural inputs today, so the witness deliberately injects the historical column-undefined model shape (via mocking `getCartesianChartModel`) to isolate and exercise the guarded line itself. The witness therefore proves the mutation is observable at the unit level and that the guard is load-bearing for that model shape; it does not reproduce the full upstream data flow (which has since gained independent protection).

Left in the worktree: the product mutation (applied) and the witness spec (added). The scratch reconstruction file was removed.