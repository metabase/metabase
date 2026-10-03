# onboarding-sso (e2e/test/scenarios/onboarding/auth/sso.cy.spec.js)

**No dividends.** 7/7 tests ported and green on the CI uberjar (`751c2a98`) on
the first run, 14/14 under `--repeat-each=2`. No `fixme`, no gate-skips, no
product-bug claims, no new gotchas. `bunx tsc --noEmit` is clean.

## What made this cheap

Everything the spec needed already existed from earlier ports in this session:

- `H.mockCurrentUserProperty("sso_source", …)` → `stubCurrentUser`
  (`support/user-settings.ts`), which is the same fetch-real-then-merge shape
  for `GET /api/user/current`. Imported, not re-implemented.
- `fillInAuthForm` → `submitLoginForm` (`support/signin.ts`).
- Only two genuinely new helpers, both trivial, in `support/onboarding-sso.ts`:
  `setupFakeGoogleAuth` (the beforeEach `PUT /api/google/settings`) and
  `signInWithEmailLink` (a one-line locator).

Nothing from `support/sso-saml.ts` (the shared group-mappings widget) was
needed — this spec never touches the admin SSO settings pages.

## Gating decision (per FINDINGS #49 — do not gate by reflex)

The source spec's inner `describe("OSS")` is a plain **describe name**, not a
Cypress `@OSS` tag. It means "no premium token active", which is exactly the
state `mb.restore()` leaves the backend in. It runs unconditionally on the EE
jar and all four of its tests pass there. Only `describe("EE")`, which calls
`activateToken`, is gated on `MB_PRO_SELF_HOSTED_TOKEN`.

**Executed: 7. Gate-skipped: 0.**

## Mutation checks run (all failed in the right direction)

1. **`cy.get("iframe")` → `toBeAttached()`** is not vacuous. Removing
   `setupFakeGoogleAuth` from the beforeEach made *both* iframe assertions
   (OSS + EE) fail with "element(s) not found" — so the iframe really is the
   Google Identity Services mount, not some incidental always-present frame.
   Worth recording because an unscoped `locator("iframe")` is exactly the kind
   of anchor that can pass for the wrong reason.
2. **The EE absence anchor** (`signInWithEmailLink → toHaveCount(0)`) is real:
   flipping `enable-password-login` back to `true` made it fail
   `Expected: 0 / Received: 1`.
3. **`stubCurrentUser` is load-bearing on page state.** The Login-History
   assertion would pass for an ordinary admin too (the tab always renders), so
   a passing test proves little on its own. Probed separately: with the
   `sso_source` stub applied the **Password** tab is absent from
   `/account/profile`, which is only true for an SSO user — the stub is
   reaching the component. (The original Cypress test has the same weak
   assertion; the port is faithful, not weakened.)

## Notes for the consolidation pass

- `support/onboarding-sso.ts` is 2 exports and could fold into `support/signin.ts`
  or a future shared `sso.ts` alongside `sso-google.ts` / `sso-saml.ts` /
  `sso-jwt.ts`. Kept separate only because parallel agents must not edit shared
  modules.
- `stubCurrentUser` currently lives in `support/user-settings.ts` under a
  user-settings-specific name; it is the general port of
  `H.mockCurrentUserProperty` and belongs next to `mockSessionProperty` in
  `support/admin-extras.ts`.

## Auth-state hygiene

`mb.restore()` in the outer beforeEach resets the whole app DB (settings and
token included), so a mid-test failure cannot poison the *next test*. It would
still leave the *slot* with `enable-password-login=false` after the last EE
test, so the EE block re-enables it in an `afterEach`. Verified by a standalone
run followed by a `--repeat-each=2` run on the same warm slot backend — no
cross-run contamination.

## Not verified

- Only run on slot 3 against the local copy of the CI uberjar; not run in CI.
- The GSI iframe assertion presumably needs outbound network to
  `accounts.google.com`. It worked here and it is what the Cypress original
  asserts, but if CI runs without egress this is the assertion that will break
  (in both harnesses equally).
