The reconstruction is complete and verified. The diff is left in the worktree.

## 1. git diff (semantic revert)

```diff
diff --git a/frontend/src/metabase/questions/components/CopyCardForm/CopyCardForm.tsx b/frontend/src/metabase/questions/components/CopyCardForm/CopyCardForm.tsx
@@ -105,8 +105,6 @@ export const CopyCardForm = ({
       {...formProviderProps}
       onSubmit={handleDuplicate}
       enableReinitialize
-      // shows validation errors if the name is too long for being saved
-      initialTouched={{ name: true }}
     >
```

This reintroduces the bug's behavior: without `initialTouched={{ name: true }}`, Formik does not mark the `name` field touched on mount, so the "must be 254 characters or less" validation error is not surfaced when the duplicate modal opens with an already-too-long name.

## 2. Oracle

- Spec: `frontend/src/metabase/questions/components/CopyCardForm/CopyCardForm.unit.spec.tsx`
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/questions/components/CopyCardForm/CopyCardForm.unit.spec.tsx`
- Baseline (clean HEAD): PASS — Tests: 4 passed, 4 total.
- Reconstructed (mutation applied): FAIL — Tests: 1 failed, 3 passed, 4 total.

## 3. failure_shape

- Failing test: `CopyQuestionForm > should show validation error on mount if name is too long`
- Assertion: `await screen.findByText(/must be 254 characters or less/)` — expected the validation error to be in the document; received a timeout because no such text renders (the field is untouched, so Formik suppresses the error). Clean DOM/assertion mismatch, not a compile/import error.

## 4. Confidence + adversarial

High confidence the failure isolates the reverted behavior. The three sibling tests stay green:
- "should not allow to enter a name with more than 254 characters" — passes because it interactively types into the field (blur marks it touched, independent of `initialTouched`).
- "should call onSaved with a dashboardTabId if one is selected" — passes (submit path unaffected).
- "should not show the dashboard tab input for models other than question" — passes (rendering logic unaffected).

Only the on-mount validation test flips, exactly the scenario the fix's `initialTouched` targets. This is a surgical one-line semantic revert with no import/compile breakage.

## 5. Outcome

`kill`. Oracle relocation: the fix's original product file `frontend/src/metabase/questions/components/CopyQuestionForm.tsx` and spec `CopyQuestionForm.unit.spec.tsx` were renamed/moved to `frontend/src/metabase/questions/components/CopyCardForm/CopyCardForm.tsx` and `CopyCardForm.unit.spec.tsx` (component `CopyQuestionForm` → `CopyCardForm`; the describe block still reads "CopyQuestionForm"). The discriminating jest test the fix shipped survives intact and catches the regression. Note the fix commit had two independent parts — a CSS/layout change to `ModalHeader` (Cypress-guarded only) and this Formik `initialTouched` change (jest-guarded); the jest-discriminating part is the one exercised here. Already closed by an existing unit test; no new test needed.