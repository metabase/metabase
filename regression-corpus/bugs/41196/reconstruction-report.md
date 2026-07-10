Reconstruction complete. Diff is left in the worktree.

## 1. git diff (semantic revert)
```diff
--- a/frontend/src/metabase/common/components/SaveQuestionForm/util.ts
+++ b/frontend/src/metabase/common/components/SaveQuestionForm/util.ts
@@ const getName = (question: Question, originalQuestion: Question | null) => {
-  if (originalQuestion) {
-    // Saved question
-    return t`${originalQuestion.displayName()} - Modified`;
-  }
-
   // Ad-hoc query
   return question.displayName() || question.generateQueryDescription() || "";
 };
```
The fix (9d19c4b) added an "if `originalQuestion` → append ` - Modified`" branch so that saving an edited saved-question preserves the original name. The bug was that the save modal did not preserve the original name. Removing that branch reintroduces the bug on the current (refactored) code, where the logic lives in `getName` inside `frontend/src/metabase/common/components/SaveQuestionForm/util.ts` (extracted out of the original `SaveQuestionModal.tsx` `initialValues` useMemo).

## 2. Oracle
- Spec: `frontend/src/metabase/common/components/SaveQuestionForm/util.unit.spec.ts`
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/common/components/SaveQuestionForm/util.unit.spec.ts`
- Baseline (clean HEAD): PASS — Tests: 17 passed, 0 failed
- Reconstructed: FAIL — Tests: 1 failed, 16 passed

## 3. failure_shape
Test: `SaveQuestionForm utils › getInitialValues › should return modified name for existing question`
```
expect(received).toBe(expected)
Expected: "Original Question - Modified"
Received: "Test Question"
```
A clean value assertion mismatch (not a compile/import error).

## 4. Confidence + adversarial
High confidence the failure isolates the reverted behavior. The mutation only removes the saved-question branch; the ad-hoc fallback (`question.displayName() || ...`) is untouched, so the sibling test `getInitialValues › should return correct initial values for a new question` (which passes `originalQuestion = null`) stays green, as do all 15 other tests (createQuestion, getTitle, getPlaceholder). Only the test exercising the "existing/saved question → append ` - Modified`" path flips. The failing test asserts a concrete non-empty string ("Test Question" from the dirty question's name), proving the original-name preservation is gone rather than a blunt undefined/crash.

## 5. Outcome
`kill`. The shipped jest regression protection survives as a relocated descendant: the original `SaveQuestionModal.unit.spec.tsx` assertion (`\`${originalQuestion.displayName()} - Modified\``) was extracted, alongside the product logic, into `SaveQuestionForm/util.ts` + its co-located `util.unit.spec.ts` (`getInitialValues › should return modified name for existing question`). Note the equivalent assertions also still live in `SaveQuestionModal.unit.spec.tsx` (lines 448/474/767), giving a second surviving jest guard. No new unit test needed — the bug is already closable by existing unit coverage.