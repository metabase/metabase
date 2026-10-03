# embedding-native.spec.ts

Port of `e2e/test/scenarios/embedding/embedding-native.cy.spec.js` — static
("guest") embedding of a NATIVE question with SQL parameters. 10 tests, all
green on the jar (slot 5), 20/20 under `--repeat-each=2`, tsc clean.

New helpers: `support/embedding-native.ts` (the `questionDetails` fixture from
`shared/embedding-native.js`, and `assertRequiredEnabledForName`). Everything
else imported read-only (embedding-dashboard.ts, embedding.ts,
dashboard-parameters.ts, factories.ts, ui.ts, question-new.ts).

## Fixes classified

- **Known gotcha (native parameter widget input drops its placeholder once it
  holds a value).** The `Product ID` number widget: `getByPlaceholder("Product
  ID").fill("10")` succeeds, but a follow-up `.press("Enter")` times out because
  the input no longer carries a placeholder to re-resolve against (the DOM
  snapshot shows the label "Product ID:" + a valued textbox with no placeholder).
  Cypress's single `.type("10{enter}")` never re-resolves, so it never hit this.
  Fix: `fill` leaves the input focused → submit with `page.keyboard.press("Enter")`.
  This is the same family as the wave-9 "native parameter widgets duplicate their
  accessible name on wrapper + inner textbox" note — accessible-name/placeholder
  on native param widgets is unreliable for a second action; resolve once or use
  the keyboard. No brief change needed; already covered by rule 4 / wave-9.

## Notes on faithfulness

- Two visit flows preserved: `visitIframe` (static-embedding-modal Preview,
  returns a FrameLocator — assertions framed; `cy.location("search")` reads
  `page.frame("embed")?.url()`, per the embedding-dashboard required-default
  precedent) vs `visitEmbeddedPage` (signed-JWT top-level goto — page-scoped
  `cy.location("search")`).
- `should("have.length",4).and("contain","OR")` on the widget set → count(4) +
  `filter({hasText})` not-count-0 (PORTING rule 3, any-of).
- `cy.findByDisplayValue("Organic")` → the Source text-filter widget's scoped
  textbox `toHaveValue("Organic")`.
- Date assertion "December 29, 2027, 4:54 AM" is timezone-sensitive; verified
  with `TZ=US/Pacific` (CI sets it).

## No migration dividends

Cross-check not needed — no `test.fixme`/product-bug claims. Nothing masked by
Cypress surfaced; the one fix was a harness re-resolution issue, not app behaviour.
