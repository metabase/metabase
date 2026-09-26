# Reconstruction report — metabase#46675 (FE)

_Verbatim final report from the FE reconstruction agent (a3840d77f1049c0aa)._

---

Reconstruction succeeded. Here is the report.

## 1. `git diff`
```diff
diff --git a/frontend/src/metabase/querying/notebook/components/JoinStep/JoinConditionDraft/JoinConditionDraft.tsx
@@ -100,13 +100,6 @@ export function JoinConditionDraft({
-  useLayoutEffect(() => {
-    setLhsExpression(undefined);
-    setRhsExpression(undefined);
-    setIsLhsOpened(true);
-    setIsRhsOpened(false);
-  }, [rhsTable]);
-
   return (
```
File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a3840d77f1049c0aa/frontend/src/metabase/querying/notebook/components/JoinStep/JoinConditionDraft/JoinConditionDraft.tsx`

## 2. Oracle spec + baseline vs reconstructed
- Spec: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a3840d77f1049c0aa/frontend/src/metabase/querying/notebook/components/JoinStep/JoinStep.unit.spec.tsx`
- Target test (fix-added): `"should reset the draft join condition state when the rhs table is changed"` (line 647)
- Baseline: `Tests: 63 skipped, 1 passed` (full suite: `1 failed → ` N/A; full run reconstructed shows `63 passed`)
- Reconstructed: `Tests: 1 failed, 63 passed, 64 total` — only the fix-added test fails.

## 3. failure_shape
Genuine assertion failure. `within(lhsColumn).findByText("Pick a column…")` throws "Unable to find an element with the text: Pick a column…"; the DOM shows the Left column still holds the stale prior selection (`Orders` / `ID`). The follow-up `queryByText("ID")).not.toBeInTheDocument()` would also fail. This is the exact bug behavior: the draft join condition's LHS column is not cleared when the RHS table is swapped.

## 4. Confidence + adversarial reasoning
High confidence. The drift here was cosmetic: the current fix code calls `setLhsExpression`/`setRhsExpression` (renamed from the commit's `setLhsColumn`/`setRhsColumn`) but the semantic fix — a `useLayoutEffect` keyed on `[rhsTable]` that resets the picked columns — is intact. Removing that effect is the minimal semantic revert of the fix's behavioral core. Adversarial checks: (a) the failure is a Testing Library assertion miss, not a compile/import crash — the unused `useLayoutEffect` import and now-unused `rhsTable` prop are tolerated by the Babel/jest transform and do not error; (b) the revert is surgical — 63 sibling tests still pass, so I didn't over-broaden; (c) the failing DOM concretely proves stale state (`ID` still present), matching the issue #46675 semantics rather than an incidental break.

## 5. Ambiguity
Minor: the fix commit spans three product files (JoinComplete `setIsAddingNewCondition(false)`, JoinDraft `rhsTable` prop + `sourceTableId` reset, JoinConditionDraft `useLayoutEffect`). The unit oracle only exercises the JoinConditionDraft effect (draft-condition column reset on RHS change), so reverting that single effect is both necessary and sufficient to fail the fix-added assertion. The JoinComplete/JoinDraft changes are covered only by the Cypress e2e (source-table-change path), not by this unit test.
