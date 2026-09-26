# 51717: live

## Where the code went
The fix (62a8a7b32e0, #67165) added `...CLOSED_NATIVE_EDITOR_SIDEBARS` to the
`onOpenQuestionInfo` handler in `frontend/src/metabase/query_builder/reducers.js`.
That file became `reducers.ts`, and then `store/reducer.ts`. At 8317274709c the
logic sits in the `OPEN_QUESTION_INFO` case of `uiControls` (line ~298). Two
things differ from July's copy:
- `uiControls` is no longer exported. Only `queryBuilderReducer` (the
  `combineReducers` result) is.
- `onOpenQuestionInfo` now comes from `./store/actions`, not `metabase/redux/query-builder`.
The fix's `queryBuilderMode: "view"` line is also gone. A later change keeps the notebook editor mounted.
It doesn't matter for this bug.

## Mutant
One line: delete `...CLOSED_NATIVE_EDITOR_SIDEBARS,` from the OPEN_QUESTION_INFO case.
`UI_CONTROLS_SIDEBAR_DEFAULTS` doesn't include `isShowingTemplateTagsEditor`, so the
Variables sidebar stays open under the info sidebar. That's the bug statement. The
constant is still used elsewhere in the file, so there's no unused-import breakage.
July's patch also had an unrelated OPEN_TIMELINES hunk. I dropped it.
Sanity check on the mutant: `store/selectors.unit.spec.ts` and
`ViewTitleHeader.unit.spec.tsx` both pass (110 tests).

## Oracle
I adapted July's witness into a new file, `store/reducer.unit.spec.ts`. No spec for
this reducer exists on master. The witness drives `queryBuilderReducer`, seeded from its
own initial state with `uiControls.isShowingTemplateTagsEditor: true`, and dispatches
`onOpenQuestionInfo()`. I removed July's inline comment. The only tag is the
`(metabase#51717)` in the test title.

Clean HEAD:
    PASS core frontend/src/metabase/query_builder/store/reducer.unit.spec.ts
      ✓ should close the native variables sidebar when opening the question info sidebar (metabase#51717)
Mutant:
    ✕ should close the native variables sidebar ... (metabase#51717)
    expect(received).toBe(expected) // Object.is equality
    Expected: false
    Received: true
    > 21 | expect(nextState.uiControls.isShowingTemplateTagsEditor).toBe(false);

## Adversarial check
The test calls the reducer as a pure function, with no render, no store wiring and no
network, so it can't fail from a render crash. On the mutant, the first assertion
(`isShowingQuestionInfoSidebar` is true) still passes. Only the Variables-flag
assertion fails, and that flag is exactly what the removed spread resets.

## Variants
- v1, defaults.ts: `CLOSED_NATIVE_EDITOR_SIDEBARS` loses `isShowingTemplateTagsEditor`. Killed.
- v2: OPEN_QUESTION_INFO drops `UI_CONTROLS_SIDEBAR_DEFAULTS` instead. Survived, because
  the witness only checks the Variables flag, not the chart or summary sidebars.
- v3: the spread is replaced by explicit snippet and data-reference closes, which forget
  Variables. Killed.

## Gotchas
- `witness.patch` adds a new file (made with `git diff --no-index`). Apply it with
  `git apply`, and the brief's `git clean` removes it.
- The mutant is plain `.ts`, so no cljs rebuild was needed. `target` is still a symlink
  to the shared fresh checkout.
