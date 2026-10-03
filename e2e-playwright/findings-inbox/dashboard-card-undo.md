# dashboard-card-undo

Source: `e2e/test/scenarios/dashboard-cards/dashboard-card-undo.cy.spec.js`
Port: `tests/dashboard-card-undo.spec.ts` (1 test)

## Result
Green on the jar (slot 1, COMMIT-ID 751c2a98): 1/1 first try, 2/2 under
`--repeat-each=2`. tsc clean.

## Fixes classified
None. Clean port — every helper reused from shared modules:
- `getTextCardDetails` / `updateDashboardCards` / `getDashboardCards` /
  `removeDashboardCard` / `createNewTab` (dashboard-core)
- `getDashboardCard` / `editDashboard` (dashboard)
- `moveDashCardToTab` / `undo` / `goToTab` (dashboard-parameters)
- `visitDashboard` (ui), `mb.api.createDashboard()`

No `support/dashboard-card-undo.ts` created (no new helpers needed); the only
spec-local function is `checkOrder`, kept inline as upstream does.

The shared `undo(page)` already clicks `undoToast(page).last()` — exactly the
transient-UI-strict-mode guard the brief calls out for undo toasts — so the
tight remove→undo / move→undo loops (8 undos total) ran without a strict-mode
violation even under `--repeat-each=2`.

## Dividends
None flagged. No product bug, no Cypress-masked issue. Cross-check not required
(no fixme / bug claim).

## Notes
- `findByText(string)` → `getByText(str, { exact: true })` (port rule 1).
- Upstream's `cy.wait(200)` "let the UI catch up before the next hover" kept as
  `page.waitForTimeout(200)`, faithful to the original.
