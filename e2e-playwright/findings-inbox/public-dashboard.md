# public-dashboard.cy.spec.js → tests/public-dashboard.spec.ts

Source: `e2e/test/scenarios/sharing/public-dashboard.cy.spec.js` (397 lines).
New helper module: `support/public-dashboard.ts` (prepareDashboard, the
appendChild anchor spy, and the spec's constants).

## Result

- 15 tests ported faithfully (10 OSS + 5 EE), all issue numbers preserved
  (metabase#41483, #65731, #50182, #62391, #62501).
- **Green on the jar (slot 2): 15/15, and 30/30 under `--repeat-each=2`.**
  tsc clean.
- No `test.fixme`, no product-bug claims, so no Cypress cross-check was
  required.
- EE describe gated on `resolveToken("pro-self-hosted")` + `activateToken`
  (rule 7); the jar activates the token so all 5 EE tests run.

## Fixes / classifications (all Known gotchas — no new ones)

- **USERS-loop `setUser` variants.** Cypress's `cy.signIn("none")` →
  `signInWithCachedSession(context, "none")` — that user is outside the
  fixture's `UserName` union but is in the snapshot login cache (Known: the
  auth note in PORTING). The link is minted as admin (`createPublicLink`)
  *before* swapping the browser session, then `page.goto` — the anonymous /
  no-perms / admin variants only differ in the session set before the visit.
- **Rule 3 first-match:** `H.filterWidget().click()` → `filterWidget(page).first().click()`.
- **`should("not.exist")` / `should("not.have.css")`** → `toHaveCount(0)` /
  `not.toHaveCSS` respectively; retried `cy.url().should("include")` →
  `expect.poll(() => page.url()).toContain(...)`.
- **`onBeforeLoad` (window override)** → `page.addInitScript` before the visit
  (the #62391 iframe-background test sets `window.overrideIsWithinIframe`).
- **`cy.intercept` of `/api/session/properties` returning HTML** → `page.route`
  + `route.fulfill` (the visit-helper POSTs the public link via the API request
  context, not the page, so the route only touches the browser navigation).

## Notable helper detail (worth a look, not FINDINGS-worthy)

- **The click-behavior anchor spy.** The "link" click behavior opens a URL by
  appending an `<a>` to `document.body`, setting `href` **after** the append,
  clicking it, and removing it (`utils/dom.ts clickLink`, target `_blank`).
  The port mirrors Cypress's `cy.spy(document.body, "appendChild")` but also
  replaces the appended anchor's own `.click()` with a capture-only no-op — so
  the assertion sees the resolved `href` (`https://metabase.com/`, trailing
  slash, matching the Cypress `element.href` property read) without the test
  actually navigating to the external site. Cleaner than the shared
  `captureNextAnchorClick` (which reads `getAttribute("href")` → no trailing
  slash and wouldn't match this test's property-based assertion).

## Dividends

None — clean faithful port, no Cypress-masked bugs surfaced.
