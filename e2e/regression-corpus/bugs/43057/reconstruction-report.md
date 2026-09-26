The reconstruction is complete and the diff is left in the worktree. Here is my report.

---

## 1. git diff (semantic revert)

```diff
diff --git a/frontend/src/metabase/querying/common/components/DatePicker/SpecificDatePicker/SingleDatePicker/SingleDatePicker.tsx
@@ export function SingleDatePicker({
   const handleTimeToggle = () => {
-    onChange({ date: clearTimePart(date), hasTime: !hasTime });
+    const nextDate = clearTimePart(date);
+    const nextHasTime =
+      nextDate.getHours() !== 0 || nextDate.getMinutes() !== 0;
+    onChange({ date: nextDate, hasTime: nextHasTime });
   };
```

This reintroduces the pre-#44859 behavior: `hasTime` is derived from the date's clock parts (the old `hasTimeParts` helper) instead of being tracked/flipped explicitly. Because `clearTimePart` always zeroes the time, toggling "Add time" on a 00:00 date now yields `hasTime: false` — exactly the "specific date filters with 00:00 time" bug the fix closed.

## 2. Oracle

- Spec: `frontend/src/metabase/querying/common/components/DatePicker/SpecificDatePicker/SingleDatePicker/SingleDatePicker.unit.spec.tsx`
- Command (from worktree root): `bun run test-unit-keep-cljs <spec>`
- Baseline (clean HEAD): PASS — Tests: 8 passed, 8 total
- Reconstructed (mutation applied): FAIL — Tests: 1 failed, 7 passed, 8 total

## 3. failure_shape

- Failing test: `SingleDatePicker › should be able to add time`
- Assertion (`toHaveBeenLastCalledWith`): `onChange` received `{ date: 2020-01-10T00:00, hasTime: false }` but expected `{ date: DATE, hasTime: true }`. Clean value mismatch (`hasTime: true` expected vs `false` received), not a compile/import error.

## 4. Confidence + adversarial

The mutation is isolated to the time-toggle path. The sibling `should be able to remove time` test (starts from a `DATE_TIME` value with `hasTime: true`, clicks "Remove time", expects `hasTime: false`) stays GREEN — under the buggy logic `clearTimePart` still yields false, so removal is unaffected. Only the *add-time-on-a-midnight-date* case flips, which is precisely the historical bug. The five calendar/input/update tests also stay green, confirming this is a targeted behavioral revert, not a blunt break.

## 5. Outcome

`kill` — with oracle relocation noted. The fix's original discriminating serialization spec (`frontend/src/metabase-lib/filter.unit.spec.ts`, which added the `hasTime` round-trip cases) is gone from jest — that logic was moved into ClojureScript (`src/metabase/lib/fe_util.cljc`, `specific-date-filter-parts`/`-clause`) by commit `5607cb71c07` "Move default filter parts to MBQL lib", so the metabase-lib jest spec no longer exists (the `all_specs_gone` class is accurate for that file). However, a surviving relocated jest **component** spec still discriminates the same 00:00-time bug: `SingleDatePicker.unit.spec.tsx` moved from `querying/components/DatePicker/...` to `querying/common/components/DatePicker/...`, and its "should be able to add time" case (default value `new Date(2020, 0, 10)` = midnight, asserting `hasTime: true`) is a clean kill. Already closable — no new test needed; the existing surviving unit test catches the regression.