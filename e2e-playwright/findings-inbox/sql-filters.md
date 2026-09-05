# sql-filters

Source: `e2e/test/scenarios/native-filters/sql-filters.cy.spec.js`
Target: `e2e-playwright/tests/sql-filters.spec.ts`

- Tests: 18 (16 active + 1 faithfully `test.skip` + the shared beforeEach setups
  across two describes). Jar (slot 1) result: 35 passed / 1 skipped on the
  matched run (`sql-filters*`), and 34 passed / 2 skipped under `--repeat-each=2`
  for `tests/sql-filters.spec.ts` alone. tsc clean.
- No fixmes, no product-bug claims, so no Cypress cross-check was required.

## Fixes / gotchas hit (all KNOWN, brief to apply)

- **SQLFilter.* surface already ported** in `support/native-filters.ts` —
  imported (openTypePickerFromDefaultFilterType, chooseType, toggleRequired,
  getRunQueryButton, getSaveQueryButton, runQuery, multiAutocompleteInput). Only
  `setWidgetValue` / `setDefaultValue` were new → the new file
  `support/sql-filters.ts`.
- **`invoke("val", "")`** (jQuery value set with no React event) → an evaluate
  that assigns `el.value = ""`. Faithful — the test then relies on the required
  toggle repopulating the widget from the default.
- **`.type()` after pre-filled content** — pressed `End` before
  `pressSequentially` so "abc"/".11" append to the default rather than landing at
  caret 0 (the wave-12 gotcha). Green as `defaultabc` / `3.11`.
- **`should("not.have.attr", "disabled")` on the Save `<button>`** → one-arg
  `not.toHaveAttribute("disabled")` (the boolean-attr gotcha, inverse case).
- **public + static embedding need no extra setup** — the `default` snapshot
  already sets `enable-public-sharing`, `enable-embedding-static` and
  `embedding-secret-key` (`e2e/snapshot-creators/default.cy.snap.js`), so the
  multiple-values public/embedded flows run on the jar as-is. `visitPublicQuestion`
  / `visitEmbeddedPage` (question-saved.ts) sign out and navigate.
- **`H.createNativeQuestion(..., {visitQuestion, wrapId})`** → `createNativeQuestion`
  (factories) returns the card; the `enable_embedding`/`embedding_params` are
  applied by its follow-up PUT, then `visitQuestion(page, card.id)` and the id is
  reused for the public/embedded visits (no wrapId aliasing needed).

## No migration dividends

Clean, faithful port. The `@skip`-tagged flaky info-popover test (#19454) is
preserved as `test.skip` with its body ported.
