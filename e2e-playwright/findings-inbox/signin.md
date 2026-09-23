# signin.cy.spec.js → tests/signin.spec.ts

10 tests (8 top-level + 2 viewport variants of the metabase#12658
forgot-password redirect), all green on the jar (slot 1), 20/20 under
`--repeat-each=2`. Verified against `target/uberjar/metabase.jar`
(COMMIT-ID 751c2a98).

## Size / fixes

- 10 tests. All issue numbers preserved (metabase#12658).
- New helpers → `support/signin.ts` only: `emailInput`, `passwordInput`,
  `signInButton`, `rememberMeCheckbox`, `submitLoginForm`, and the retry helper
  `clickAuthLinkExpectUrl` (see the dividend below).
- Imported read-only: `browseDatabases` (question-settings.ts), `getProfileLink`
  (command-palette.ts), `USERS` (sample-data.ts). Passwords are referenced only
  through the `USERS` indirection — never inlined or logged.
- This is the only spec that drives the real `/auth/login` form instead of
  injecting a cached session. `beforeEach` does `mb.restore()` + `mb.signOut()`
  (clears `metabase.SESSION`); tests needing an authed start call
  `mb.signInAsAdmin()` first. A fresh browser context per test means there are no
  stale cached-session cookies to fight — `signOut` is a clean no-op on the
  cookieless tests and correctly de-auths after `signInAsAdmin`.

## Fixes classified

- **Mechanical:** rule 1 exact matches (`findByLabelText`, `cy.button`,
  `findByRole` heading/link/gridcell names). `cy.intercept("POST","/api/dataset")`
  + `cy.wait("@dataset")` → `page.waitForResponse` registered before the
  triggering click (rule 2) — only the redirect-after-login test awaits it.
  `cy.url().should(contain/not.contain)` → `toHaveURL` / `not.toHaveURL`.
  `gridcell "37.65"` is a findAll → `.first()`.

- **New gotcha (also a migration dividend, below):** the metabase#12658 link
  clicks needed a `toPass` retry (`clickAuthLinkExpectUrl`). Ported literally,
  the 1280×800 viewport failed **deterministically** (3/3) while 640×360 passed
  (3/3) — the small viewport put the link below the fold, so Playwright scrolled
  it to center and the page settled before clicking.

## Migration dividend — Cypress-masked login-page layout instability

Clicking the "I seem to have forgotten my password" link at a desktop viewport
does not navigate under Playwright's real mouse. Instrumented the native events:
the anchor receives `pointerdown`/`mousedown`, but the `mouseup`/`click` land on
a sibling `DIV`, not the anchor — the link shifts down ~10px **mid-click**.

Root cause (confirmed): the login form autofocuses the email field
(the "should greet users" test asserts `toBeFocused`). The first pointerdown on
the link blurs that empty field, which renders a "required" validation error and
reflows everything below it — including the link — between mousedown and mouseup.
Measured: `linkY` 589 → 599 with exactly one "required" error appearing;
blurring the email first (settling the error) makes the very next click navigate.
`focus()+Enter` and `dispatchEvent("click")` both navigate, because neither
depends on where a physical mouseup lands.

**Cross-check (fidelity):** the original Cypress spec passes both viewports on
the *same* jar backend (:4101, `--browser chrome`, 2/2). Cypress's `.click()` is
a synthetic dispatch of the whole event sequence on the resolved anchor, so it
is immune to the reflow — which is exactly why the instability was invisible for
the life of this test. So: the app's router is fine and the port is faithful;
this is a real, Cypress-masked layout papercut. A real user who lands on the
page and immediately clicks the link (without touching the email field) can have
their click swallowed by the same reflow. Not filed as a product-bug `fixme`
(the port is made robust instead), but worth surfacing: **the fix for the
instability is to not reflow the form on the blur-triggered "required" error, or
to reserve space for it.**

The port's `clickAuthLinkExpectUrl` is self-healing: the first click renders the
error and settles the layout, the retry lands on the now-stable link. It also
covers the symmetric "Back to sign in" link on the forgot-password page, whose
email field is autofocused the same way.
