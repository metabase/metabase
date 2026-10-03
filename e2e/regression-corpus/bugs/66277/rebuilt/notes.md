# 66277: hour/minute click behavior passes only the day to a linked question

## Where the code moved
- Fix 9f65da5129a touched `metabase-lib/v1/parameters/utils/click-behavior.ts` and `metabase/lib/formatting/date.tsx`.
- At 8317274709c those are `frontend/src/metabase/dashboard/utils/click-behavior.ts` (moved in #79145) and
  `frontend/src/metabase/value-formatting/date.tsx`.

## Which half of the fix this is
The fix covers two paths:
- Dashboard filter (#58556, date/all-options): `formatDateTimeForParameter` hour/minute -> `YYYY-MM-DDTHH:mm`.
  July's mutant targeted only this path, and so did the record's hint test (`date.unit.spec.tsx` "should format hour").
- Linked question (#66277, master's e2e: "Go to a custom destination" -> Saved question -> Created At):
  `formatSourceForTarget` sends dimension and variable targets with hour/minute units to `formatDateToRangeForParameter`,
  which now returns `start~end` in `YYYY-MM-DDTHH:mm`.
The bug statement and master's e2e both describe the linked-question path, so the mutant targets that path.

## Mutant
It deletes the hour/minute branch in `formatDateToRangeForParameter`. Hour and minute values then fall through to
`isSameDay` and return `start.format("YYYY-MM-DD")`, the same day-only string the pre-fix code produced
(pre-fix, hour/minute went through `formatDateForParameterType("date/single")`, which dropped the time).
I did not revert the two click-behavior.ts hunks. The unbinned-DateTime fix (#72863) now depends on the
date/single hour/minute branch, so reverting it would also break that fix's existing tests.

## Oracle (new witness, adapted from the cull-branch witness in da261afed6f)
July left no witness.patch. The cull branch landed a variable-target version of this test. I adapted it to use a
question dimension target, which is what master's e2e exercises, and to use a 06:30 value so `startOf` matters.
The witness is an `it.each` over hour and minute in `dashboard/utils/click-behavior.unit.spec.ts`.
- Clean: `Tests: 35 passed, 35 total` (both #66277 cases pass).
- Mutant: `Tests: 2 failed, 152 passed` (run together with date.unit.spec.tsx, which stays green).
  - hour: `Expected: "2020-01-01T06:00~2020-01-01T07:00"`, `Received: "2020-01-01"`
  - minute: `Expected: "2020-01-01T06:30~2020-01-01T06:31"`, `Received: "2020-01-01"`

## Variations
- variant-1 drops hour/minute from the range-unit list in formatSourceForTarget. The question gets an instant,
  `2020-01-01T06:30`. Result: kill.
- variant-2 makes `getEndOfInterval` use `endOf(unit)` for hour/minute, so the range ends at 06:59 (and the
  minute range becomes 06:30~06:30). Result: kill.
- variant-3 is July's mutation (`formatDateTimeForParameter` hour/minute -> `YYYY-MM-DD`). The witness survives.
  The same spec file's #72863 "unbinned type/DateTime for date/all-options" test fails, and so does
  `date.unit.spec.tsx` "should format hour/minute".

## Adversarial check
- The failure is a `toEqual` string mismatch, not a crash. The received value is exactly the pre-fix output.
- The mutant only reaches `formatDateToRangeForParameter` callers that pass hour/minute. `formatDateTimeForParameter`
  handles those units before its range fallback, so only the non-parameter (question) branch of
  formatSourceForTarget is affected.
- All 33 other click-behavior tests pass on the mutant, including the dashboard-filter and #72863 tests, and so do
  all 119 date.unit.spec tests. This isolates the bug to the linked-question path.

## Gotchas
- The record's hint test (`date.unit.spec.tsx` "should format hour") does not kill this mutant. It covers the
  #58556 dashboard-filter half.
- The caller said the e2e assertions differ between master and the cull branch. In fact the cull branch (da261afed6f)
  deleted the #66277 `it` block and renamed the describe; HEAD 8317274709c and master still have it unchanged.
- `timeout` isn't installed on this machine, so run jest directly.
