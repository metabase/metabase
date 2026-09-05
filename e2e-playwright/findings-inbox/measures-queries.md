# measures-queries.spec.ts

Port of `data-studio/measures/measures-queries.cy.spec.ts` (~888 lines, 29 tests).
Verified on the CI EE uberjar (slot 2): **29/29 pass**, stable under
`--repeat-each=2` on a representative subset (14/14). tsc clean.

New helper module: `support/measures-queries.ts` (MeasureEditor, visitNewMeasurePage,
updateMeasure, CustomExpressionEditor type/clear/name pieces, and the spec-local
startNewMeasure / saveMeasure / useMeasureInAdhocQuestion / breakout /
verifyScalarValue / verifyRowValues). Everything else imported read-only from shared
modules (factories, filter-bulk createSegment, metrics-explorer createMeasure, models
summarize/openQuestionActions, notebook, ad-hoc-question openTable, ui, metrics
filterInNotebook).

Gate: token only (`pro-self-hosted`, EE measures). Fully jar-runnable — no external
DB / email / webhook. Describe `test.skip`s without the token.

## Fixes (all mechanical harness adaptations — no product bugs, no fixmes)

1. **Display toggle "Switch to data" is a disabled SegmentedControl → force-click.**
   `QuestionDisplayToggle.tsx` renders a Mantine `SegmentedControl` whose *both*
   options carry `disabled: true`; the toggle behaviour lives entirely in an
   `onClick`/`onKeyDown` on the control root. Playwright's actionability walks up to
   the disabled option and refuses the click ("element is not enabled", 60 retries);
   Cypress clicks the labelled svg regardless. `verifyRowValues` now uses
   `click({ force: true })`. This is a fresh, concrete instance of the wave-10
   "Playwright refuses to click a descendant of a disabled/aria-disabled ancestor"
   gotcha — worth flagging because the disabled attr is on the option, not an
   obvious wrapper, and it broke *every* tabular-result test (7 at once) while the
   scalar/pivot/x-ray tests were unaffected.

2. **A model visited at `/question/:id` runs its query via `POST /api/dataset`,
   not `/api/card/:id/query`.** The strict shared `visitQuestion` (waits for both
   `query_metadata` GET and the card-query POST) hangs on a model — neither fires.
   H.visitModel (default `hasDataAccess`) waits on `/api/dataset`; the follow-up-model
   test now does the same (goto + wait on `/api/dataset`). The follow-up-*question*
   test uses the shared `visitQuestion` unchanged and passes, so this is model-specific.

## Notes

- The empty-cell-tolerant `verifyRowValues` (upstream's custom `assertTableData`)
  ports verbatim: empty result cells render no `cell-data` testid, so the flattened
  non-empty values map onto the `cell-data` list by index. Confirmed correct on the
  jar (offset queries with a blank first-period cell).
- Duplicate upstream `it` title ("should create a measure based on another measure
  with an identity expression" appears twice) → second suffixed `(2)` (Playwright
  duplicate-title hard load error; the two `it`s are byte-identical in upstream).
- Custom-expression aggregation editor is the same CodeMirror
  `custom-expression-query-editor` widget as the notebook custom-column editor;
  real keystrokes drive it, focus asserted before typing. The unicode `→` in
  `[Product → ID]` and ASCII `->` in `[Product -> Price]` both type fine via
  `keyboard.type`; the editor expands `->` to `→` itself.
- undoToast assertions filter to the matching toast then `.first()` — toasts stack
  ("Measure created" can still be fading), so a bare `toast-undo` resolve would be a
  strict-mode multi-match under the faster runner (the standing transient-UI rule).
