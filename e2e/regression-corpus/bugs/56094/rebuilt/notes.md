# 56094: data/visualization toggle vanishes after switching an auto-pivot table to raw data

## Where the code moved
The fix (3ca4c5a2ee0) edited `getIsVisualized` in `frontend/src/metabase/query_builder/selectors.js`.
At 8317274709c that file is `frontend/src/metabase/query_builder/store/selectors.ts`; the selector
sits at line 1043 with the fix's predicate unchanged, so July's patch was stale only by path
(the fix's other change, a `data-testid` on QuestionDisplayToggle, is inert).

## Mutant
Restores the pre-fix predicate byte for byte: `(settings != null && settings["table.pivot"])`
in place of `table.pivot || (display === "table" && table.pivot_column)`.
Why it is the same bug: `ViewFooter` renders `CenterViewFooterButtonGroup` (the toggle) only when
`getIsVisualized` is truthy. Switching to data sets `uiControls.isShowingRawTable`, and `getRawSeries`
then forces `"table.pivot": false` into the series settings. `table.pivot_column` still has a
computed default (`getDefaultPivotColumn`) regardless of `table.pivot`, and that is the only
thing that keeps the question "visualized" in the raw view. Drop that clause and the toggle goes.

## Oracle
New test in `frontend/src/metabase/query_builder/store/selectors.unit.spec.ts`, `getIsVisualized`
block, next to the existing implicit-pivot test. Same state (display table, count + CATEGORY +
VENDOR cols) plus `uiControls: { isShowingRawTable: true }`, asserting `toBeTruthy()` (the
selector returns the pivot column name, not a boolean).
I did not reuse July's witness: it called `getIsVisualized.resultFunc` with hand-made settings, so
it never checked that the raw-table path really leaves `table.pivot_column` populated. This one goes
through `getRawSeries` -> `getComputedSettingsForSeries` like the app does.

Clean (whole file, 36 tests):
```
✓ should be true when the table is implicitly visualized as a pivot table
✓ should stay truthy when an implicit pivot table is switched to the raw data view (metabase#56094)
Tests: 36 passed, 36 total
```
Mutant:
```
✕ should stay truthy when an implicit pivot table is switched to the raw data view (metabase#56094)
  expect(received).toBeTruthy()  Received: false
  > 522 | expect(getIsVisualized(state)).toBeTruthy();
Tests: 1 failed, 35 passed, 36 total
```

## Adversarial check
- Selector test with no render, so a render crash can't cause it. `Received: false` (not undefined,
  not a throw) shows settings were computed and `table.pivot` was explicitly false, which only the
  `isShowingRawTable` override in `getRawSeries` produces. So the clean pass must come from the
  `table.pivot_column` clause, which is exactly what the mutant removes.
- The neighbouring implicit-pivot test and 34 others still pass on the mutant: it loads, and it
  breaks only the raw-view case, which is the bug statement.

## Variants (oracle = the new test)
1. `display() === "pivot"` instead of `"table"` in the pivot_column case: kill (Received: false).
2. `table.pivot || (...)` -> `&&`: kill. Also fails the existing implicit-pivot test (`toBe(true)` gets "CATEGORY").
3. Dropped `display() !== "list"` guard: survive (the oracle never uses a list display).

## Things that would trip the next person
- Running the file prints `console.warn Error getting setting table.pivot TypeError: object is not
  iterable` with a stack ending at spec line 449 (the `table.columns`-only test, which has no query
  results). It is already there on untouched HEAD and is not a failure.
- The selector returns a string on the pivot_column path, so `toBe(true)` would fail on clean.
  Use `toBeTruthy()`. Mutant is a `.ts` file only; no cljs rebuild.
