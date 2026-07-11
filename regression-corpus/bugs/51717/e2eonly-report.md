Done. Both the product mutation and the witness are left applied in the worktree.

## Report

### 1. git diff (product mutation)
Semantic revert of the load-bearing product change, in `frontend/src/metabase/query_builder/reducers.ts` (the fix commit's `reducers.js` was since converted to TS; the logic is unchanged):

```diff
       .addCase(OPEN_QUESTION_INFO, (state) =>
         setUIControls(state, {
           ...UI_CONTROLS_SIDEBAR_DEFAULTS,
-          ...CLOSED_NATIVE_EDITOR_SIDEBARS,
           isShowingQuestionInfoSidebar: true,
         }),
       )
```

The fix commit `62a8a7b3` had `pf=2`. The second change — `aria-label={t\`Variables\`}` in `NativeVariablesButton.tsx` — is a pure **test hook** (lets the e2e find the Variables button by label); it does not affect the bug. The **load-bearing** change is the `CLOSED_NATIVE_EDITOR_SIDEBARS` spread in the `OPEN_QUESTION_INFO` reducer case. Reverting only that reintroduces the bug.

### 2. Witness
New spec at `frontend/src/metabase/query_builder/reducers.unit.spec.ts` — a pure reducer test dispatching `onOpenQuestionInfo()` against a state where the variables sidebar is open (`isShowingTemplateTagsEditor: true`) and asserting it gets closed.

Oracle command: `bun run test-unit-keep-cljs frontend/src/metabase/query_builder/reducers.unit.spec.ts`
- PASS on clean HEAD (1 passed).
- FAIL on mutant with clean assertion: `expect(nextState.isShowingTemplateTagsEditor).toBe(false)` → `Expected: false, Received: true`.

### 3. Bug summary
`UI_CONTROLS_SIDEBAR_DEFAULTS` does not include `isShowingTemplateTagsEditor`, whereas `CLOSED_NATIVE_EDITOR_SIDEBARS` does. Without the spread, opening the question info sidesheet while the native **Variables** (template tags) sidebar is already open leaves `isShowingTemplateTagsEditor: true`. Both sidebars render, with the variables sidebar stacked on top, so the info sidesheet is not interactive (the e2e clicks the "History" tab and checks for "You created this"). The fix closes native editor sidebars when opening the info sidebar.

### 4. Outcome
`witness_authored` — the bug is unit-catchable at the reducer seam; the e2e is replaceable by this jest test.

### 5. Confidence
High. The mutation is the exact inverse of the fix commit's product change, at the same reducer case, and the observable (`isShowingTemplateTagsEditor` staying `true` after `OPEN_QUESTION_INFO`) is precisely the state that leaves the variables sidebar visible over the info sidebar in the e2e. The reducer is a pure function of `(state, action)`, so the unit assertion discriminates the behavior directly with no render/routing/browser dependency.