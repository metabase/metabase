# Reconstruction report — metabase#32963 (FE)

_Verbatim final report (ab6160098500a4f8b)._

---

Reconstruction complete and verified. Here is the report.

## Report: bug metabase#32963 reconstruction

### (1) git diff
```diff
diff --git a/frontend/src/metabase/query_builder/actions/core/initializeQB.ts b/frontend/src/metabase/query_builder/actions/core/initializeQB.ts
   if (question.isSaved()) {
-    const type = question.type();
-
-    if (type === "question") {
-      question = question.lockDisplay();
-    }
+    // Don't set viz automatically for saved questions
+    question = question.lockDisplay();
 
     if (currentUser?.is_qbnewb) {
```
File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-ab6160098500a4f8b/frontend/src/metabase/query_builder/actions/core/initializeQB.ts`

### (2) Oracle + results
- Oracle spec: `frontend/src/metabase/query_builder/actions/core/initializeQB.unit.spec.ts` (jest, `bun run test-unit-keep-cljs`)
- Baseline: `Tests: 135 passed, 135 total`
- Reconstructed: `Tests: 2 failed, 133 passed, 135 total`

### (3) failure_shape
Clean assertion failure (`expect(received).toBeFalsy()` / `Received: true`) on the two fix-added tests:
- `models › structured model › doesn't lock display` (spec line 545-548)
- `models › native model › doesn't lock display`

These are the unit-test analogs of the fix commit's new "doesn't lock display" assertions for datasets/models.

### (4) Confidence + adversarial reasoning
High confidence. The fix commit (1ce8e2c) changed the product so `lockDisplay()` is skipped for models; the file has since drifted from `if (!question.isDataset())` to `if (type === "question")`, but the semantics are identical. My revert removes the type guard so display is locked for ALL saved questions — exactly the original bug behavior (models get their display locked). Adversarial checks:
- Not a `git apply -R`: I re-derived the semantic revert against the drifted code, not the original diff text.
- Failure is a genuine assertion failure, not a compile/type/import error or arity mismatch — the 2 failing tests are precisely the behavior-capturing ones, and the other 133 (including saved-question "locks display" tests) still pass, confirming a targeted behavioral revert rather than a broad break.
- Baseline passed and reconstructed failed on the same spec/cwd, so symlinks/cwd are correct.

### (5) Ambiguity
None significant. The original fix removed a "locks display" test from one block and added "locks display" (saved questions) + "doesn't lock display" (models) tests; only the models assertions are sensitive to this bug, and they fail correctly. No honest-negative category applies — this is a clean unit-oracle reconstruction.
