# document-links.spec.ts

Port of `e2e/test/scenarios/documents/document-links.cy.spec.ts` (7 tests, all
faithful, all green on the jar; 14/14 under `--repeat-each=2`, slot 2).

## Fixes classified

- **Dropped-first-char in the link URL input (flake, known-gotcha class).**
  First `--repeat-each=2` run: `keyboard.type("test.com")` into the floating
  formatting-menu URL input landed as `est.com` — the leading `t` was dropped
  even though `toBeFocused()` had already passed. This is the same failure mode
  as PORTING rule 5 (`page.keyboard.*` types at `document.activeElement` with no
  retry). Fix: type via `locator.pressSequentially(text, { delay: 25 })` on the
  located input, which re-focuses and dispatches per-char with retry. Applied to
  both the add and edit URL entries. No product signal — pure harness timing.

## Notes / faithfulness

- No `test.fixme`, no product-bug claims — nothing needed the Cypress
  cross-check.
- `cy.realPress(["Shift","{leftarrow}"])` × 4 → `Shift+ArrowLeft` at ~25ms
  cadence (ProseMirror selection-coalescing gotcha, wave 9).
- No-access smart link is NOT a link role (upstream uses `findByText`, not
  `findByRole`) — matched the element carrying both the `No access` text and the
  `eye_crossed_out` icon via `filter({ has: page.locator(".Icon-...") })`.
- 403 mock uses a predicate route on the exact `/api/card/:id` pathname so it
  doesn't swallow `/query` etc.
- Async-filtered `/` link-suggestion list: gated on an option carrying the card
  name being visible before clicking `.first()` (list-re-renders gotcha).

## Dividends

- None. No Cypress-masked bug surfaced; assertions are as strong as upstream
  (the anchor `href` is asserted directly via `toHaveAttribute`, same as the
  upstream `invoke("attr","href")`).

## New helper file

`support/document-links.ts` — `documentMentionItem` (missing from shared
documents-core), `openLinkSuggestionBrowseAllPicker`,
`openLinkMentionMenuBrowseAllPicker`. Consolidation candidate:
`documentMentionItem` belongs next to `commandSuggestionItem` in
`documents-core.ts` on a later shared-file pass.
