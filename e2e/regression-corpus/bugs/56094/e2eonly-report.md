Done. Outcome: **witness_authored**.

## 1. git diff (product mutation)
Semantic revert of the load-bearing change in `frontend/src/metabase/query_builder/selectors.ts` (`getIsVisualized` selector), left applied in the worktree:

```diff
-      (settings != null &&
-        (settings["table.pivot"] ||
-          (question.display() === "table" && settings["table.pivot_column"])))), // last case - pivot_column is set but display is set to table viz (#56094)
+      (settings != null && settings["table.pivot"])),
```

The fix commit (`3ca4c5a`) touched 2 product files, but the `QuestionDisplayToggle.tsx` change only added a `data-testid` used by the e2e — inert product-wise. The `selectors.ts` change is the load-bearing fix.

## 2. Witness
Added to the existing `getIsVisualized` describe block in `frontend/src/metabase/query_builder/selectors.unit.spec.ts`, asserting on the pure `resultFunc` seam of the reselect selector:

```ts
it("should be true when display is table and only `table.pivot_column` is set (metabase#56094)", () => {
  const question = { display: () => "table" } as unknown as Question;
  const settings = { "table.pivot_column": "CATEGORY" };

  expect(getIsVisualized.resultFunc(question, settings)).toBeTruthy();
});
```

Oracle command: `bun run test-unit-keep-cljs frontend/src/metabase/query_builder/selectors.unit.spec.ts -t "getIsVisualized"`
- PASS on clean HEAD (resultFunc returns truthy `"CATEGORY"`).
- FAIL on mutant: `Received: undefined` (the reverted `settings["table.pivot"]`-only branch yields undefined for a raw-table display with only `table.pivot_column`).

Note: `.toBeTruthy()` rather than `.toBe(true)` because the selector short-circuits to the truthy column-name string rather than a coerced boolean — the observable discriminator is truthy-vs-undefined, which is exactly what drives the display toggle's visibility.

## 3. Bug summary
`getIsVisualized` decides whether a question counts as "visualized" (which keeps the data/visualization display toggle mounted). For an auto-pivot table (2 breakouts + 1 aggregation), when the user switches to the raw "data" view, `display` becomes `"table"` and `table.pivot` is no longer set — but `table.pivot_column` persists. With the mutation, `getIsVisualized` returns falsy in that state, so the toggle disappears and the user can't switch back to the pivot visualization. The e2e (switch to data → toggle should exist → switch to visualization → toggle should exist) checks exactly this.

## 4. Outcome
`witness_authored` — the bug is unit-catchable at the selector level; the e2e is replaceable by this jest witness.

## 5. Confidence
High. The mutation is a byte-faithful restoration of the pre-fix predicate (confirmed against `git show`). The witness isolates the precise scenario the fix added (`display === "table"` with `table.pivot_column` but no `table.pivot`) and discriminates cleanly (truthy vs `undefined`) with no compile error, verified in both directions.