The reconstruction succeeded. Diff is left in the worktree.

## Report

**1. git diff** — semantic revert (1 line, in the relocated product file):
```diff
--- a/frontend/src/metabase/visualizations/lib/formatting/value.tsx
+++ b/frontend/src/metabase/visualizations/lib/formatting/value.tsx
@@ -147,7 +147,7 @@ export function formatValueRaw(
   if (value == null) {
-    return options.stringifyNull ? NULL_DISPLAY_VALUE : null;
+    return null;
```
This reintroduces the pre-fix behavior: null values always format to `null`, ignoring the `stringifyNull` option that the fix (#45262) added to render `(empty)` for null funnel dimensions.

**2. Oracle**
- Spec: `frontend/src/metabase/visualizations/lib/formatting/value.unit.spec.tsx` (relocated + renamed descendant of the shipped `frontend/test/metabase/lib/formatting.unit.spec.js`; `.js`→`.tsx`, `frontend/test/`→co-located under `visualizations/lib/formatting/`).
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/visualizations/lib/formatting/value.unit.spec.tsx`
- Baseline (clean HEAD): PASS — Tests: 41 passed (2 target tests pass).
- Reconstructed: FAIL — Tests: 1 failed, 40 passed.

**3. failure_shape**
- Failing test: `formatValue › should format null as (empty) when stringifyNull option is true`
- Assertion: `expect(formatValue(null, { stringifyNull: true })).toEqual("(empty)")` → Expected: `"(empty)"`, Received: `null`. Clean value mismatch, not a compile/import error.

**4. Confidence + adversarial**
- High confidence, tightly isolated. The mutation drops only the `stringifyNull` branch. Its sibling test `should return null on nullish values by default` (asserting `formatValue(null) === null`) stays GREEN — proving the revert didn't blunt-break the null path, it specifically removed the opt-in stringification. All 40 other tests in the file pass, so no collateral / import breakage.

**5. Outcome** — `kill`. The bug is caught by a surviving jest unit test (relocated `.js`→`.tsx` and co-located). Product logic (`formatValueRaw` in `value.tsx`, moved from `metabase/lib/formatting/` to `metabase/visualizations/lib/formatting/`) and both discriminating tests survive intact. No new test needed — the existing oracle already closes the hole.