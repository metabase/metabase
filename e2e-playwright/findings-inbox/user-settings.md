# user-settings (onboarding/setup/user_settings.cy.spec.js → tests/user-settings.spec.ts)

21 tests, all green on the jar (COMMIT-ID 751c2a98), slot 5. Stable under
`--repeat-each=2` (42/42). No `test.fixme`, no product-bug claims.

## Capability dividend: the dark-mode kbar shortcut fires reliably in Playwright

**This is the headline finding — a direct parallel to FINDINGS #1 (an input
Playwright drives that Cypress can't).**

The dark-mode toggle is a kbar/tinykeys global shortcut, `$mod+Shift+KeyL`
(`frontend/src/metabase/palette/shortcuts/global.ts:201`). In the Cypress suite
this shortcut was **unreliable in headless Chrome**: `cypress-real-events`
`realPress([metaKey,"Shift","L"])` did not reach the tinykeys handler after
navigating Home — a CDP-keyboard-dispatch limitation (Chrome v123+ headless
intercepts the CDP keyboard event before it reaches the page). The Cypress spec
worked around it by giving up on real input entirely and **dispatching a
synthetic `KeyboardEvent`** at `cy.get("body").trigger("keydown", {...,
eventConstructor: "KeyboardEvent"})` — an explicit comment in the original spec
records both the tinykeys `instanceof` requirement and the headless-Chrome CDP
interception.

The Playwright port uses a **real key press**:

```ts
await page.keyboard.press("ControlOrMeta+Shift+KeyL");
await assertDarkMode(page);
```

(`ControlOrMeta` resolves to Meta on macOS and Control on Linux/CI — the same
platform branch the Cypress spec did by hand via `Cypress.platform === "darwin"`.)

**Verdict: it works, and it is stable.** The shortcut test passed:
- 1/1 on the first full-spec run,
- 2/2 under `--repeat-each=2`,
- 3/3 under `--repeat-each=3` run against the test in isolation,

= **5/5 real-input firings, zero synthetic-event fallback.** Playwright's input
model dispatches keystrokes through the browser's real input pipeline rather
than CDP `Input.dispatchKeyEvent` the way cypress-real-events does, so the
tinykeys handler receives a genuine `KeyboardEvent` and the `instanceof` +
`$mod+Shift+KeyL` match both succeed. This is a genuine capability the Cypress
harness lacked; the port is *stronger* than the original (real input vs. a
hand-rolled synthetic dispatch), not merely faithful.

## Port mechanics (no gotchas worth promoting to PORTING.md)

- **stubCurrentUser** (SSO describes: ldap/google/jwt/saml) → `page.route` on
  GET `/api/user/current`, fetching the real user and merging `sso_source`,
  the same fetch-real-then-fulfil shape as `admin-extras.mockSessionProperty`.
  It survives the per-worker slot URL because the intercepted request's own
  url + cookies are forwarded to the `fetch`.
- **stubSystemColorScheme** (Cypress stubbed `window.matchMedia` via
  `onBeforeLoad`) → `page.emulateMedia({ colorScheme })`. Cleaner and
  equivalent: it drives the *real* `prefers-color-scheme` media query the app
  reads, so no matchMedia stub is needed.
- **assertLightMode/assertDarkMode** assert `body` `background-color` against
  the verbatim computed strings (`rgb(249, 249, 250)` and
  `color(srgb 0.0204 0.06792 0.0996)`). Both Cypress' Chrome and our bundled
  Chromium return the `color(srgb …)` form identically — same-engine, so the
  literal comparison holds.
- The all-locales test (metabase#22192) iterates every available locale with a
  goto + getUser wait per locale; `test.slow()` gives it headroom (ran ~7.5s).

## New helpers

All in `support/user-settings.ts` (new file, no shared files edited): NORMAL_USER,
NORMAL_USER_ID, getFullName, assertLightMode/assertDarkMode, colorSchemeInput,
stubCurrentUser, waitForGetUser, goToProfile. Imports the shared
`findByDisplayValue` (filters-repros), `getProfileLink` (command-palette),
`popover` (ui) rather than re-implementing.
