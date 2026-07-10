# Reconstruction report — metabase#65942 (FE)

_Verbatim final report from the worktree-isolated FE reconstruction agent (a264197a87f1947ae)._

---

Reconstruction succeeded.

## 1. git diff
```diff
diff --git a/frontend/src/metabase/selectors/user.ts b/frontend/src/metabase/selectors/user.ts
--- a/frontend/src/metabase/selectors/user.ts
+++ b/frontend/src/metabase/selectors/user.ts
@@ -37,7 +37,7 @@ export const canAccessSettings = createSelector(
 export const getUserAttributes = createSelector(
   [getUser],
-  (user) => user?.attributes || {},
+  (user) => user?.login_attributes || {},
 );
```
Single-line semantic revert in `frontend/src/metabase/selectors/user.ts` (the fix commit's behavioral product change was `login_attributes` → `attributes`; I reverted it back). No changes to type/mock files — the `attributes` field on the `User` type and mock is left intact, so there's no compile error masking the failure.

## 2. Oracle spec + baseline vs reconstructed
Oracle: `frontend/src/metabase/selectors/user.unit.spec.ts`
- Baseline: `Tests: 5 passed, 5 total`
- Reconstructed: `Tests: 1 failed, 4 passed, 5 total`

Failing assertion: `getUserAttributes › should return user attributes including JWT-sourced attributes` (spec line 31) — `expect(getUserAttributes(state)).toEqual({ jwt_attr, manual_attr })`. With the bug, the mock user has those keys under `attributes` (not `login_attributes`, which defaults to `null`), so the selector returns `{}`.

The other two new assertions (`attributes: null` → `{}`; no current user → `{}`) still pass — correct, since both selectors coincide when there are no attributes. The bug only manifests when `attributes` and `login_attributes` diverge, which is exactly what the fix's key test targets.

## 3. failure_shape
Assertion failure — Jest deep-equality mismatch: `Expected {jwt_attr, manual_attr}` / `Received {}`. Not a compile/import/crash error.

## 4. Confidence + adversarial reasoning
High. The failure is a genuine value-level `toEqual` mismatch, not a neutralized/structural error. It is isolated (1 of 5), reproduces the exact real-world regression (JWT-sourced user attributes stored in the `attributes` map are silently dropped because the selector read the legacy `login_attributes` field), and both the type and mock still carry `attributes`, so nothing short-circuits compilation. Change is a minimal one-token behavioral revert, matching the fix commit's product diff.

## 5. Ambiguity
None. Harness note: the worktree lacked `node_modules` — I symlinked it (and `target`) from the main tree; baseline then passed as expected.
