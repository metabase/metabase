Reconstruction succeeded — a clean kill. Leaving the diff in place per instructions.

---

## Report

### 1. git diff (semantic revert)
```diff
diff --git a/frontend/src/metabase/visualizations/lib/formatting/date.tsx b/frontend/src/metabase/visualizations/lib/formatting/date.tsx
@@ -769,7 +769,7 @@ export function formatDateTimeForParameter(
   } else if (unit === "day") {
     return m.format("YYYY-MM-DD");
   } else if (unit === "hour" || unit === "minute") {
-    return m.format("YYYY-MM-DDTHH:mm");
+    return m.format("YYYY-MM-DD");
   } else if (unit) {
     return formatDateToRangeForParameter(value, unit);
   }
```
This reintroduces the original bug (issues #58556 / #66277): `formatDateTimeForParameter` formatting `hour`/`minute` units as a bare day, dropping the time component — exactly the pre-fix behavior the old `"should format hour as a day"` test asserted.

### 2. Oracle
- Spec (relocated): `frontend/src/metabase/visualizations/lib/formatting/date.unit.spec.tsx` (moved from the shipped `frontend/src/metabase/lib/formatting/date.unit.spec.tsx`; product logic moved `frontend/src/metabase/lib/formatting/date.tsx` → `frontend/src/metabase/visualizations/lib/formatting/date.tsx`).
- Command: `bun run test-unit-keep-cljs frontend/src/metabase/visualizations/lib/formatting/date.unit.spec.tsx -t "formatDateTimeForParameter"` (run from worktree root).
- Baseline (clean HEAD): PASS — Tests: 29 passed, 90 skipped.
- Reconstructed (mutation applied): FAIL — Tests: 2 failed, 27 passed, 90 skipped.

### 3. failure_shape
- `formatDateTimeForParameter › should format hour` — Expected `"2020-01-01T06:00"`, Received `"2020-01-01"`.
- `formatDateTimeForParameter › should format minute` — Expected `"2020-01-01T06:00"`, Received `"2020-01-01"`.

Both are clean value-equality (`toBe`) mismatches, not compile/import errors.

### 4. Confidence + adversarial
High confidence the failure isolates the reverted behavior. The mutation touches only the `hour`/`minute` branch of `formatDateTimeForParameter`; sibling assertions in the same `describe` stay green — `should format day` still yields `2020-01-01`, and year/quarter/month/week/quarter-of-year all pass, confirming the day-format fallback and every other unit path are intact. Exactly the two time-granularity tests flip, and the received value equals the pre-fix output. The range function (`formatDateToRangeForParameter`/`getEndOfInterval`) was deliberately left untouched to keep the revert surgical; no unrelated `formatDateTimeRangeWithUnit` or `formatDateTimeWithUnit` tests were disturbed.

### 5. Outcome
`kill` — the shipped regression protection survives as a discriminating jest unit test (relocated from `metabase/lib/formatting` to `metabase/visualizations/lib/formatting`, same `.unit.spec.tsx` filename). The bug for issues #58556 / #66277 is caught at the unit layer with a value assertion; no Cypress dependency needed. Already closable by the existing unit test.