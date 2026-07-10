# Reconstruction report — metabase#43799 (FE)

_Verbatim report (a5eaee6631a8850bd)._

---

Reconstruction complete and verified.

## Report

### (1) `git diff`
```diff
diff --git a/frontend/src/metabase-lib/v1/parameters/utils/targets.ts b/frontend/src/metabase-lib/v1/parameters/utils/targets.ts
@@ -192,12 +192,7 @@ export function getParameterColumns(
   parameter?: Parameter,
   opts?: GetParameterColumnsOpts,
 ) {
-  // treat the dataset/model question like it is already composed so that we can apply
-  // dataset/model-specific metadata to the underlying dimension options
-  const query =
-    question.type() !== "question"
-      ? question.composeQuestionAdhoc().query()
-      : question.query();
+  const query = question.query();
 
   // Pivot tables cannot work when there is an extra stage added on top of breakouts and aggregations
   const nextQuery =
```

File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a5eaee6631a8850bd/frontend/src/metabase-lib/v1/parameters/utils/targets.ts`

### (2) Oracle + baseline vs reconstructed
- Oracle spec: `frontend/src/metabase-lib/v1/parameters/utils/targets.unit.spec.ts`
- Baseline (fixed): `Tests: 2 skipped, 27 passed, 29 total`
- Reconstructed (buggy): `Tests: 7 failed, 2 skipped, 20 passed, 29 total`

### (3) failure_shape
Clean assertion failures (`toEqual` deep-equality + `toHaveLength`), no crashes/TypeErrors/arity errors. All 7 failures are in the `getParameterColumns › * › model › *` describe blocks. The signature is that model columns now report table `"Orders"` (raw underlying table) instead of `"Question"` (composed model virtual table), and temporal/model column filters return the wrong count.

### (4) Confidence + adversarial reasoning
High confidence. The fix commit 6dff2dfe ("Fix parameter mapping with models #43848") for bug #43799 introduced `getParameterColumns` whose defining line composes dataset/model questions via `composeQuestionAdhoc()` before deriving parameter columns — "treat the dataset/model question like it is already composed so that we can apply dataset/model-specific metadata." My revert removes exactly that composition, restoring the pre-fix behavior where models used their raw underlying query. This is a genuine semantic revert (not `git apply -R`; the surrounding code drifted heavily — `getParameterTargetField` was rewritten, `comparison.ts` moved and its `#43799` hack removed), localized to the one product function the oracle imports. The bug's blast radius is precisely the model path: all 20 non-model tests (including the 3 fix-modified `getParameterTargetField` assertions) still pass, and only the 7 model tests fail — matching the fix's stated scope ("with models").

Note on localization: the 3 assertions the fix textually modified in the spec (`getParameterTargetField`) all use numeric field IDs and hit the fast id-match path, so they do not discriminate this bug. The current (drifted) oracle spec added `getParameterColumns` model tests that directly exercise the fix's model-composition behavior, so those are the true discriminating assertions — and they fail as required.

### (5) Ambiguity
No `reconstruction_failed`. Minor ambiguity: the discriminating assertions live in spec blocks added after the fix commit rather than in the 3 assertions the fix itself edited, but they validate the same product change (`getParameterColumns` model composition) from the same commit, so the reconstruction is sound and unambiguous in behavior.
