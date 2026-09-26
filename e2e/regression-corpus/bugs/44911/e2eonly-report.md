Both product mutations and the witness are in place. Let me report.

## Report

### 1. git diff (product mutation)
Semantic revert of fix commit `7491d37` (PR #64766, issue #44911). Two load-bearing product changes, both exercised by the e2e repro:

**`ArchivedBulkActions.tsx`** (delete-cancel path) — re-added `clearSelected()` into `handleCloseModal`, which is the `onClose` of the delete `ConfirmModal`:
```
   const handleCloseModal = () => {
     setSelectedItems(null);
     setSelectedAction(null);
+    clearSelected();
   };
```

**`CollectionBulkActions.tsx`** (move-cancel path) — pointed `BulkMoveModal`'s `onClose` back at the clearing handler:
```
-            onClose={handleCancelModal}
+            onClose={handleCloseModal}
```
(`handleCancelModal` becomes unused — harmless, jest/swc doesn't type-check.)

### 2. Witness
Added to `frontend/src/metabase/collections/components/CollectionBulkActions/ArchivedBulkActions.unit.spec.tsx` — reuses the existing `TestComponent`/`setup` harness, now threading a captured `clearSelected` spy. Test: select items → click "Delete permanently" → dialog opens → click "Cancel" → assert `clearSelected` was NOT called.

Oracle command:
```
bun run test-unit-keep-cljs frontend/src/metabase/collections/components/CollectionBulkActions/ArchivedBulkActions.unit.spec.tsx -t "44911"
```
- **PASS on clean HEAD** (handleCloseModal doesn't clear): 1 passed.
- **FAIL on mutant** (clean assertion, not a compile error): `expect(jest.fn()).not.toHaveBeenCalled()` — Expected 0 calls, received 1.

The mutation is currently re-applied in the worktree (so CI can run the e2e against it), and the witness is left applied.

### 3. Bug summary
When a user multi-selects items in the Trash (or a collection), starts a bulk action, then aborts it — cancels the "Delete permanently" confirmation dialog, or cancels the "Move" entity-picker modal — the selection is wiped instead of being preserved. The e2e repro (`trash.cy.spec.js`, "should not deselect items when aborting operations (metabase#44911)") checks that the checkboxes stay checked after cancelling both delete and move, and that only *completing* an action resets the selection.

### 4. Outcome
`witness_authored` — the bug is unit-catchable, so the e2e is replaceable (at least the delete-cancel half). `clearSelected` is a plain prop callback; the cancel path is drivable in jsdom via the ConfirmModal's real "Cancel" button, and the spy discriminates fixed vs. mutant cleanly. The move-cancel half (CollectionBulkActions) is analogously unit-testable via the same spy pattern, though the witness only asserts the delete-cancel seam.

### 5. Confidence
High. The mutation is the exact inverse of the shipped fix: the fix's whole purpose was to stop `clearSelected()` from firing on cancel, and re-adding that call to the modal's `onClose` reproduces precisely the observable the e2e guards (selection cleared on abort). The witness targets the same callback the fix rerouted, passes clean and fails on the mutant with a value assertion (no compile/render error), confirming the behavioral difference is observable at the unit level.