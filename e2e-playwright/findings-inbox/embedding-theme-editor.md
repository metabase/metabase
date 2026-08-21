# embedding-theme-editor

Source: `embedding/embedding-theme-editor/theme-editor.cy.spec.ts`
Port: `tests/embedding-theme-editor.spec.ts` (+ `support/embedding-theme-editor.ts`)

15 tests, all faithful. Verified on the CI EE jar (COMMIT-ID 751c2a98), slot 2:
15/15 green, 30/30 under `--repeat-each=2`. tsc clean (the two tsc errors in the
tree are a sibling's `support/content-translation-dashboards.ts`, not this port).

EE + `pro-self-hosted` token gated (whole describe skips without the token; the
jar activates it in `beforeEach`).

## Fixes classified

- **Known gotcha (rule 1).** `getByLabel("Font")` is a case-insensitive
  *substring* match, so it also resolved the "Base **font** size" input →
  strict-mode violation. Cypress `findByLabelText("Font")` is exact. Fixed with
  `{ exact: true }`. The brief already carries this rule; nothing new.

## Dividends

None. No product bug, no Cypress-masked issue, no strengthened assertion.

Notes for anyone touching this area:

- The color assertions (`settings.colors.brand === "#ff0000ff"`) read the PUT
  request body, not rendered pixels — computed by the `color` JS lib
  deterministically, so **no** Chromium-vs-Chrome concern despite being about
  colors.
- The "delete a dirty theme without getting stuck on a 404" repro (an
  already-fixed app bug) passes cleanly on the jar — the leave-guard suppression
  in `EmbeddingThemeEditorApp` holds.
- Mantine `Collapse` for the "additional colors" section applies `display:none`
  when closed, so the faithful `should("not.be.visible")` port
  (`not.toBeVisible()`) works without needing `toBeInViewport()`.
