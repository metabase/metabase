Done. Final worktree contains only the semantic revert. Here is my report.

---

## 1. git diff (semantic revert)

`frontend/src/metabase/redux/entities/tables-reducer.ts` — removed the fix's schema-sync from the `CARD_UPDATED` existing-virtual-table branch, reintroducing bug #39812 (stale collection/schema info when a saved question's source collection changes):

```diff
     if (state[virtualTableId]) {
       const virtualTable = state[virtualTableId];
-      const virtualSchemaId = getCollectionVirtualSchemaId(card.collection);
-      const virtualSchemaName = getCollectionVirtualSchemaName(card.collection);
-
       if (
         virtualTable.display_name !== card.name ||
         virtualTable.moderated_status !== card.moderated_status ||
-        virtualTable.description !== card.description ||
-        virtualTable.schema !== virtualSchemaId ||
-        virtualTable.schema_name !== virtualSchemaName
+        virtualTable.description !== card.description
       ) {
         state = updateIn(state, [virtualTableId], (table) => ({
           ...table,
           display_name: card.name,
           moderated_status: card.moderated_status,
-          description: card.description,
-          schema: virtualSchemaId,
-          schema_name: virtualSchemaName,
+          description: card.description,
         }));
       }
       return state;
     }
```

## 2. Oracle

- Spec: `frontend/src/metabase/redux/entities/tables-reducer.unit.spec.ts` (the only surviving jest spec exercising this logic)
- Command: `bun run test-unit-keep-cljs frontend/src/metabase/redux/entities/tables-reducer.unit.spec.ts` (from worktree root)
- Baseline (clean HEAD): PASS — Tests: 14 passed
- Reconstructed (bug reintroduced): PASS — Tests: 14 passed → **oracle does NOT flip**

## 3. failure_shape

No existing test flips. The suite never dispatches a `cardUpdated` with a *changed collection* against an existing virtual table, so it never asserts `schema`/`schema_name` sync — exactly the fix's discriminating behavior. Its "sync display_name and description" and "leave untouched" tests keep `collection: null` and pass identically before and after the revert.

I proved the hole is closable by writing a throwaway discriminating test (card moves `null` → collection `{id:7, name:"foo"}`). Against the reverted code it FAILS with a clean value assertion:
```
expect(received).toBe(expected)
Expected: "-1337:foo"
Received: "-1337:Everything%20else"   // stale schema
```
and it PASSES on clean HEAD. (Removed after verifying; worktree left with the revert only.)

## 4. Confidence + adversarial

High confidence this is a genuine coverage hole, not a blunt break. The revert is minimal and surgical: it removes only the two schema-related comparison terms and the two update fields the fix added, leaving the pre-fix display_name/description/moderated_status sync intact — that's why all 14 tests stay green. Repo-wide search confirms `tables-reducer.unit.spec.ts` is the *only* jest spec referencing `tablesReducer`/`cardUpdated`; the other `schema_name` specs (uploads, permissions fixtures, QuestionDataSource) never dispatch a card update. The shipped discriminating jest assertion lived in `frontend/src/metabase/entities/schemas.unit.spec.js`, which — along with the entire Schema entity — was deleted in #74085 ("Remove Schema entity"); the tables entity was later removed in #74575, migrating this logic into `tables-reducer.ts` with a *new* refactor-era spec that never re-covered the #39812 scenario.

## 5. Outcome

**reconstruction_failed — category: cypress_only.**

The bug reintroduces cleanly into current product code (`tables-reducer.ts`), but no surviving jest spec catches it. #39812's regression protection is the Cypress e2e (`.../data-selector-virtual-table-collection-change.cy.spec.ts`) plus the now-deleted `schemas.unit.spec.js` assertion. The over-revert (fully neutralizing the schema sync) trips ZERO jest specs, confirming the hole.

**Closable: yes.** The live logic in `tables-reducer.ts` is directly unit-testable — a single `tablesReducer` test dispatching `cardUpdated` with a moved collection and asserting `schema`/`schema_name` update would kill this mutation (demonstrated above).