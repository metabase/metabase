The reconstruction is complete. The diff is left in the worktree.

## 1. git diff — the semantic revert

`enterprise/frontend/src/embedding/data-picker/DataSelector/DataSelector.jsx`, method `getCardType()`:

```diff
   getCardType() {
-    const { selectedDataBucketId, savedEntityType } = this.state;
-    if (
-      selectedDataBucketId === DATA_BUCKET.MODELS ||
-      savedEntityType === "model"
-    ) {
-      return "model";
-    } else {
-      return "question";
-    }
+    return "question";
   }
```

This reintroduces the exact #39699 behavior the fix prevented: a model source is no longer distinguished, so the data-source picker treats it as a saved question ("models shown/highlighted as questions"). It is a semantic value change (not a compile/import break).

## 2. Oracle

- Spec: `enterprise/frontend/src/embedding/data-picker/DataSelector/tests/DataSourceSelector.unit.spec.tsx`
- Command (from worktree root): `bun run test-unit-keep-cljs enterprise/frontend/src/embedding/data-picker/DataSelector/tests/DataSourceSelector.unit.spec.tsx`
- Baseline (clean HEAD): Tests: 7 passed, 7 total.
- Reconstructed (mutated): Tests: 1 failed, 6 passed, 7 total.

## 3. failure_shape

- Failing test: `DataSourceSelector › both models and tables are available › should skip the bucket step and show the SavedEntityPicker right away if there is only models in the bucket step`
- Assertion: `expect(screen.getByText("Models")).toBeInTheDocument()` →
  `TestingLibraryElementError: Unable to find an element with the text: Models`. With the model branch removed, the `SavedEntityPicker` back-navigation renders `CARD_INFO["question"].title` = "Saved Questions" instead of `CARD_INFO["model"].title` = "Models".

## 4. Confidence + adversarial

High confidence, isolated. The sibling test `both questions and tables… only questions in the bucket step` asserts `getByText("Saved Questions")` and stays GREEN under the mutation — because the question path was always "question" and is unaffected. The other 5 tests (table search, click-outside, join-database filter, metabase#74428 bucket-timing) also stay green. Only the model-highlighting assertion flips, proving the failure isolates the reverted `getCardType()` model branch rather than a blunt render/import break. The failure is a pure DOM text mismatch (TestingLibraryElementError), not a compile error.

## 5. Outcome

**kill** — with oracle relocation/fork noted.

The fix commit (`8a4e14c`) shipped its only regression assertion as the Cypress e2e `39699-notebook-data-source-models.cy.spec.js` (now living at `e2e/test/scenarios/question/notebook-data-source.cy.spec.ts`, test `metabase#39699`). Its shipped jest edit was a pure rename (`SavedQuestionPicker` → `SavedEntityPicker`); the direct descendant spec `frontend/src/metabase/querying/common/components/DataSelector/saved-entity-picker/SavedEntityPicker.unit.spec.tsx` survives but is **non-discriminating** (renders `type="question"` only; its two tests — collection ordering and case-insensitive sort #23693 — predate #39699). The OSS `DataSelector.unit.spec.js` covers only db/schema/table navigation.

However, the identical changed product logic (`getCardType()` → `CARD_INFO[type].title` model highlighting) was later forked into the enterprise embedding data-picker, where `DataSourceSelector.unit.spec.tsx` added a discriminating DOM assertion that a models-only bucket renders the "Models" back-navigation. That spec is a valid "jest spec exercising the changed product logic" oracle, and it flips cleanly. So the bug class is **closable/closed by a unit test** — and in fact already is, in the EE embedding fork. If OSS-only coverage were required, the same one-line assertion (`type="model"` → back-nav shows "Models") could be added to the OSS `SavedEntityPicker.unit.spec.tsx`.

Note: the mutation was applied to the EE fork's `getCardType()` because that is the copy the discriminating oracle exercises; the OSS `getCardType()` in `frontend/src/metabase/querying/common/components/DataSelector/DataSelector.jsx` holds the identical logic but has no discriminating jest spec bound to it.