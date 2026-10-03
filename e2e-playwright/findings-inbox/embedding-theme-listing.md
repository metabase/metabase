# embedding-theme-listing

Port of `embedding/embedding-theme-editor/theme-listing.cy.spec.ts` →
`tests/embedding-theme-listing.spec.ts`. 6 tests, all faithful. Verified on the
jar (slot 3): 6/6, then 12/12 under `--repeat-each=2`. tsc clean. No fixmes, no
product-bug claims (so no Cypress cross-check required).

## Fixes classified

All mechanical, all covered by existing rules — nothing new:

- `cy.get("@createTheme.all").should("have.length", 0)` (assert NO POST fired) →
  a passive `page.on("request")` counter checked at the end. There is no
  response to await for a request that must never happen, so the Cypress
  intercept degrades to a request tally. (Not previously spelled out in PORTING,
  but a straightforward instance of rule 2's "drop never-awaited intercepts" — a
  zero-count assertion instead of a wait.)
- `cy.wait("@createTheme")` reading the request body → `waitForResponse`
  registered before the Save click, body via `request().postDataJSON()` (rule 2).
- `should("not.exist")` → `toHaveCount(0)`; retried `cy.url().should("match")` →
  `expect.poll` (URL-retry rule).
- findByText / findByLabelText / findByRole(menuitem) string args → `{exact:true}`
  (rule 1); `/New theme/`, `/Cancel/`, `/Delete/` role names stay regex.
- `H.undoToast().findByText(...)` → `undoToast(page).filter({hasText}).first()`
  (transient-UI strict-mode rule — mirrors the theme-editor port).

## Helper reuse / dividends

- `createThemeViaApi` reused read-only from `support/embedding-theme-editor.ts`.
  Note the two Cypress specs define *different* `createThemeViaApi` bodies: the
  listing spec's `./helpers` version sends only `{colors:{brand}}`, while the
  editor spec (and the shared PW helper) sends the full default color set. The
  listing tests only need a named theme, so the richer superset is harmless —
  no divergence, one shared helper.
- New listing-only helpers isolated in `support/embedding-theme-listing.ts`
  (getThemeCard / openThemeActionMenu / clickThemeMenuItem / deleteAllThemes) —
  no shared files edited.

## Consolidation note (later pass, not blocking)

`undoToast` (support/metrics.ts) and `undoToastList` (support/organization.ts)
are byte-identical (`getByTestId("toast-undo")`). Both the theme-editor and
theme-listing ports import one or the other of these duplicates. Candidate to
unify into a single `ui.ts` toast helper.
