Clean flip. The diff is left in the worktree. Report below.

---

## FE semantic-reconstruction report — issue 44937

### 1. git diff (semantic revert)
`frontend/src/metabase/dashboard/components/Dashboard/DashboardEmptyState/DashboardEmptyState.tsx`
```diff
   let title = getDefaultTitle(isDashboardEmpty);
   if (isEditing) {
-    title = canCreateQuestions
-      ? t`Create a new question or browse your collections for an existing one.`
-      : t`Browse your collections to find and add existing questions.`;
+    title = t`Create a new question or browse your collections for an existing one.`;
   }
```
This reintroduces the exact bug: in editing mode the empty-state title always suggests "Create a new question…" regardless of `canCreateQuestions`. The `canCreateQuestions` prop is still received (no compile/import break) — it is just semantically ignored, matching the pre-fix behavior where users with no query-creation permission were wrongly told to create a new question.

### 2. Oracle
- Spec: `frontend/src/metabase/dashboard/components/Dashboard/DashboardEmptyState/DashboardEmptyState.unit.spec.tsx` (co-located; not relocated — same path as the fix shipped).
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/dashboard/components/Dashboard/DashboardEmptyState/DashboardEmptyState.unit.spec.tsx`
- Baseline (clean HEAD): Tests: 8 passed, 8 total.
- Reconstructed (mutation applied): Tests: 2 failed, 6 passed, 8 total.

### 3. failure_shape
Failing tests (parameterized `it.each(["dashboard","dashboard tab"])`):
- "renders dashboard empty state in editing mode without create questions permission"
- "renders dashboard tab empty state in editing mode without create questions permission"

Assertion mismatch at `assertBodyText` → `screen.getByRole("heading", { name: title })`:
- Expected heading name: `"Browse your collections to find and add existing questions."`
- Received DOM: heading rendered as `"Create a new question or browse your collections for an existing one."` → `getByRole` throws (unable to find an accessible element with that name). A clean value/DOM mismatch, not a compile/import error.

### 4. Confidence + adversarial
High confidence the failure isolates the reverted behavior. The two failing tests are exactly the pair that set `canCreateQuestions: false` in editing mode. All sibling tests stay green:
- "renders dashboard/tab empty state in editing mode" (default `canCreateQuestions: true`) still pass — the "Create a new question…" title is correct for them, so the mutation doesn't touch them.
- Non-editing and read-only tests pass unchanged.
No import removed, no prop signature change, `illustration()` and the `addQuestion` click assertions still succeed — only the title text branch flips, confirming a surgical behavioral isolation rather than a blunt break.

### 5. Outcome
`kill`. The bug is caught by a surviving discriminating jest spec (co-located, no relocation needed). The shipped Cypress reproduction (`e2e/.../dashboard-reproductions.cy.spec.js` issue 44937) also guards it, but the unit spec alone is sufficient — the hole is closed by existing unit coverage.