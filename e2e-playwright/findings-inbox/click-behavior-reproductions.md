# click-behavior-reproductions

Port of `dashboard-cards/click-behavior-reproductions.cy.spec.ts` (3 tests,
one independent bug each: #59049, #64368, #73448).

Verified on the jar (COMMIT-ID 751c2a98), slot 3: **3/3 green**, 6/6 under
`--repeat-each=2`. tsc clean.

## Result

Clean port — no fixmes, no product-bug claims, no divergences. All three
assertions ported faithfully and pass on the jar as the originals do.

## Fixes / classification

None required beyond mechanical porting. Everything the spec needed already
existed in the consolidated shared modules; the only new symbol is a faithful
port of `createMockActionParameter` in the new
`support/click-behavior-reproductions.ts`.

Mechanical notes (no new gotchas — all covered by existing rules):
- `H.createQuestionAndDashboard(...).then(({ body: card, questionId }))`: `body`
  is the DASHCARD, so `card.id` = dashcard id, `card.dashboard_id` = dashboard
  id, `questionId`/`card_id` = card id. The shared factory's superset return
  object exposes all of these (`{ id, dashboard_id, questionId, card_id }`).
- Rule 1: `cy.findByText(...)` string args ported as `getByText(..., {exact:true})`.
- `cy.get(H.POPOVER_ELEMENT).should("not.exist")` → `expect(popover(page)).toHaveCount(0)`.
- Retried `cy.location(...)` checks → `expect.poll` (pathname/search), per the
  one-shot-URL-assertion rule.
- `.should("contain"/"not.contain", ...)` on `filterWidget().eq(n)` →
  `toContainText` / `not.toContainText`.
- `.should("have.length",1).should("contain.text", ...)` on parameter widgets →
  the shared `expectFilterWidgets(page, 1, ...)`.

## Dividends

None flagged. The reproductions all describe fixed bugs and pass, so there is
no Cypress-masked issue to surface here.

## Not verified

- Only ran against the local CI uberjar (751c2a98) on slot 3, chromium. Not run
  in source mode (jar is the contract) and not cross-checked against the
  original Cypress spec (no divergence to adjudicate — all tests pass as-is).
