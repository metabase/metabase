# card-embed-node

Port of `e2e/test/scenarios/documents/card-embed-node.cy.spec.ts` (814 lines,
no gating tags) → `tests/card-embed-node.spec.ts`. 15 tests, all green on the
jar (slot 1), 30/30 under `--repeat-each=2`, tsc clean. New helpers in
`support/card-embed-node.ts` only.

No `test.fixme`, no product-bug claims, so no Cypress cross-check was required.

## Fixes classified

- **Known gotcha (avoided).** The `.node-paragraph.is-empty` selector for the
  empty trailing paragraph is safe on the jar because both classes are
  `:global` in `Editor.module.css` (verified), not CSS-module tokens — so it is
  not an instance of the minified-class trap.
- **Known gotcha (ProseMirror focus).** `documentUndo` (H.documentUndo port)
  must focus the editor before `cmd/ctrl+z`. Clicking the editor *center* lands
  on a card embed (`contenteditable=false`), which does NOT move focus to the
  ProseMirror root, so the undo keystroke is dropped. Fix: click the top-left
  (`position {x:5,y:5}`, the intro paragraph text) and assert `toBeFocused`
  before pressing. Cypress hid this: `.type("{cmd+z}", {force:true})` types
  regardless of focus.
- **Rule-1 correction (jQuery vs CSS selector).** Cypress `.find("[data-index=0]")`
  accepts the unquoted attribute value; Playwright's `locator("[data-index=0]")`
  throws `not a valid selector`. Must quote: `[data-index="0"]`.
- **Callback-scoped assertion → assert outside the hook.** The two
  open-in-new-tab tests use `H.onNextAnchorClick(cb)` with the attribute
  assertions *inside* `cb` (plus a `cy.on("uncaught:exception")` guard so a
  failed in-hook assert doesn't crash the test). Ported via
  `captureNextAnchorClick` + `expectCapturedAnchor`, asserting the captured
  href/rel/target OUTSIDE the hook — a never-fired anchor now fails loudly. The
  uncaught-exception guards were only needed for the in-hook style and were
  dropped. (Same pattern the click-behavior port established.)

## Migration dividend

- **HTML5 card drop is faithfully portable via synthetic events, and it is the
  right call here over Playwright real dnd.** The card drop is processed by the
  `HandleEditorDrop` ProseMirror plugin, which reads the drop event's `clientX`
  to choose the 20%/80% side (`handleDrop` + `handleDOMEvents.dragstart` in
  `HandleEditorDrop.tsx`). Replaying the Cypress helper's exact synthetic
  sequence (mousedown → dragstart → mousemove → dragover → mouseup → drop →
  dragend, sharing one `DataTransfer`) inside a single `page.evaluate` drives
  ProseMirror's own DOM listeners identically. Playwright's `dragTo` cannot
  place the drop at a precise side offset, so the general "never port the bare
  3-event sequence" advice does NOT apply to precise-coordinate ProseMirror
  drops — the synthetic replay is both faithful and the only way to control the
  drop side. All 8 drag/reorder/move-between-container tests pass first try
  with it, and fast (drops ~1–2s).

## Notes for consolidation

- `dragAndDropCardOnAnotherCard` / `documentUndo` are documents-domain helpers
  living in the new file; if a future documents batch consolidates, these
  belong next to the documents-core drag helpers.
- The two `DOCUMENT_WITH_*` fixtures and the three question-id lookups are
  inlined (the upstream `document-initial-data.ts` imports through the `e2e/*`
  path alias, unusable from this project — same reason documents-core inlined
  its card fixtures).
