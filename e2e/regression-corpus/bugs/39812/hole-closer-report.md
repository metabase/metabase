Hole closed. Here is my report.

## 1. Test added
`frontend/src/metabase/redux/entities/tables-reducer.unit.spec.ts` — one new test in the `saved questions virtual table sync` block:

```ts
it("should sync schema and schema_name into an existing virtual table when the collection changes on UPDATE", () => {
  const { question, virtualTable } = getQuestion({ collection: null });
  const state = { [virtualTable.id]: virtualTable };

  const movedCollection = { id: 7, name: "foo" };
  const moved = { ...question, collection: movedCollection };
  const { virtualTable: movedVirtualTable } = getQuestion({
    collection: movedCollection,
  });

  const nextState = tablesReducer(state, getUpdateAction(moved));

  expect(nextState[virtualTable.id]).toMatchObject({
    schema: movedVirtualTable.schema,
    schema_name: movedVirtualTable.schema_name,
  });
  expect(nextState[virtualTable.id].schema).not.toBe(virtualTable.schema);
});
```

It follows the file's existing conventions: reuses the `getQuestion` factory (to derive the expected virtual-schema values rather than hardcoding `-1337:foo`) and the `getUpdateAction` helper.

## 2. Level
Reducer level — a direct `tablesReducer(state, cardUpdated(card))` call. This is the exact layer the fix lives in (`tables-reducer.ts` `CARD_UPDATED` existing-virtual-table branch), so it kills the mutation with no React/DOM machinery. The report prescribed reducer-level and it's the only surviving jest surface for this logic.

## 3. Proof
- Clean HEAD: `Tests: 15 passed, 15 total` — new test PASSES.
- Semantic revert applied (removed the two `schema`/`schema_name` comparison terms and the two update fields per the report): `Tests: 1 failed, 14 passed, 15 total` — new test FAILS with a clean value assertion:
  ```
  expect(received).toMatchObject(expected)
  - "schema": "-1337:foo",         "schema_name": "foo",
  + "schema": "-1337:Everything%20else", "schema_name": "Everything else",
  ```
  Matches the reconstruction agent's predicted value exactly.

## 4. Isolation
Only the new test flipped; all 14 sibling tests (CREATE, archive, display_name/description sync, untouched-on-no-change, error-flag, and the entire `original_fields` block) stayed green under the revert. The failure is a value assertion (`toMatchObject` on `schema`/`schema_name`), not a compile error — the reverted product file left the now-unused imports in place, so the module still loaded.

## 5. Outcome
`hole_closed`. Product file restored to HEAD; `git diff --stat` shows only the spec file (+19 lines).