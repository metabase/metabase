The reconstruction is complete. Here is the final report.

---

**Issue 25614 | fix_commit 13f589c0 | class all_specs_gone**

### 1. git diff (semantic revert)
```diff
diff --git a/frontend/src/metabase/visualizations/echarts/cartesian/model/dataset.ts
@@ getNormalizedDatasetTransform
       return stackModel.seriesKeys.reduce((acc, key) => {
         const numericValue = getNumberOrZero(datum[key]);
-        acc[key] = numericValue / total;
+        acc[key] = numericValue;
         return acc;
       }, normalizedDatum);
```
Left in the worktree at `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a598eabdba00c7c35/frontend/src/metabase/visualizations/echarts/cartesian/model/dataset.ts`.

### 2. Oracle
- Spec: `frontend/src/metabase/visualizations/echarts/cartesian/model/dataset.unit.spec.ts`
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/.../dataset.unit.spec.ts -t "normalized datasets"`
- Baseline (clean HEAD): PASS (Tests: 1 passed, 30 skipped)
- Reconstructed (mutated): FAIL (Tests: 1 failed, 30 skipped)

### 3. failure_shape
Test: `dataset transform functions › applyVisualizationSettingsDataTransformations › should return an array of normalized datasets`. Clean value mismatch via `toEqual`:
- Expected `series1: 0.3333…, series2: 0.6666…` (and `0.4285…/0.5714…`)
- Received `series1: 100, series2: 200` (and `300/400`) — raw, un-normalized values.

### 4. Confidence + adversarial
The shipped fix added `getNormalizedStackedTrendDatas` (each value ÷ column sum) plus a jest spec asserting that exact division. Through the dc.js→ECharts migration (#41395, which deleted the original `trends.unit.spec.js`), that normalization logic was consolidated into `getNormalizedDatasetTransform` in `dataset.ts` — the surviving descendant. The `getTrendLines` code in `model/trend-line.ts` reuses this very function to normalize stacked-100% trend lines. The mutation removes the `/ total` division (the identical operation the fix introduced). Running the full spec file: **1 failed, 30 passed** — every sibling stays green (including the "stacked" and "min numeric values" transform tests), so the failure isolates the reverted normalization behavior rather than blunt-breaking the transform pipeline. The failure is a data-value assertion, not a compile/import error.

### 5. Outcome
`kill`. Oracle relocated: `frontend/src/metabase/visualizations/lib/trends.unit.spec.js` (`getNormalizedStackedTrendDatas`) → `frontend/src/metabase/visualizations/echarts/cartesian/model/dataset.unit.spec.ts` ("should return an array of normalized datasets", exercising `getNormalizedDatasetTransform`). A surviving jest spec catches the reintroduced bug; no new test needed.