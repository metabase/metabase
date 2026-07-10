# Reconstruction report — metabase#28834 (FE)

_Verbatim report (a87a1a05bf5661742)._

---

Reconstruction succeeded. Bug metabase#28834 behavior reintroduced via a minimal semantic revert of the product code (not `git apply -R`).

## 1. git diff
Product file only (`frontend/src/metabase/query_builder/components/view/ViewFooter/ViewFooterDownloadWidget.tsx`) — re-added the `!isResultDirty` gate the fix removed:
```
   const visualizationSettings = useSelector(getVisualizationSettings);
+  const isResultDirty = useSelector(getIsResultDirty);
 
   return (
     question &&
     result &&
+    !isResultDirty &&
     QuestionDownloadPopover.shouldRender({ result }) && (
```
(plus the `getIsResultDirty` import). Spec is untouched.

## 2. Oracle + baseline vs reconstructed
Oracle: `bun run test-unit-keep-cljs frontend/src/metabase/query_builder/containers/QueryBuilder.unit.spec.tsx -t "downloading results"`
- Baseline: `Tests: 8 skipped, 2 passed, 10 total`
- Reconstructed: `Tests: 1 failed, 8 skipped, 1 passed, 10 total`

The failing test is exactly the fix-added one: `"should allow downloading results for a native query using the current result even the query has changed but not rerun (metabase#28834)"`. The sibling non-dirty test `"should allow downloading results for a native query"` still passes, confirming the change is targeted to the dirty case.

## 3. failure_shape
Behavioral element-not-found at spec line 216: `screen.getByTestId("question-results-download-button")` throws "Unable to find an element by data-testid". After typing ` union SELECT 2` into the native editor the result is dirty, so `ViewFooterDownloadWidget` gates the download button out and it never renders — the user cannot reach the download flow. This is the original bug behavior (can't download after editing a native query without rerunning). Not a compile/import/arity error.

## 4. Confidence + adversarial reasoning
High confidence.
- The fix (commit 26b1a6b) was a one-line removal of `!isResultDirty &&` from `QueryDownloadWidget.shouldRender`. That widget was refactored into `QuestionDownloadPopover.shouldRender({ result })` (now just `canDownloadResults`) with the render decision moved to `ViewFooterDownloadWidget`. I re-added the identical `!isResultDirty` gate at that relocated decision point — semantically the same mechanism, not a spec edit.
- Failure is a genuine behavioral/RTL failure (button absent), not a crash or type error.
- The non-dirty download test remains green, proving the gate only suppresses the dirty-result case, matching the bug's scope.

## 5. Ambiguity
None material. The only drift was code motion (widget split + gate relocated from `shouldRender` into `ViewFooterDownloadWidget`); the spec's metabase#28834 assertions survived intact and still pin the exact behavior.
