# multi-factor-auth (admin-2/multi-factor-auth.cy.spec.ts → tests/multi-factor-auth.spec.ts)

353 lines, 8 tests. **8/8 genuinely executed and green on the CI uberjar
(`target/uberjar/metabase.jar`, COMMIT-ID 751c2a98), 16/16 under
`--repeat-each=2`. `bunx tsc --noEmit` clean. No fixmes, no skips, no product-bug
claims.**

Slot 3 / :4103, jar mode throughout. The two email tests were executed against a
locally-launched `bunx maildev@2.0.5` (see "Harness note" below), not gate-skipped.

## Fixes needed while stabilizing (1)

### New gotcha — auth-form reflow drops the click, generalised beyond `signin.ts`

*Category: new gotcha (a broader instance of a known one).*

`PORTING.md` already documents this for auth **links** (`support/signin.ts`
`clickAuthLinkExpectUrl`: the autofocused email field blurs on the first
pointerdown, its "required" validation error renders, the page reflows ~10px
between mousedown and mouseup, and Playwright's real mouse drops the click while
Cypress's synthetic dispatch is immune).

The same mechanism fires on the **MFA challenge form's `AuthTextButton`s**
("Use a recovery code instead", "Email me a code"), which live inside the same
`<Form>` as the autofocused `Authenticator code` input. First run: the click on
"Use a recovery code instead" never delivered, the form stayed in authenticator
mode, and the failure surfaced 30s later as `getByLabel('Recovery code')` timing
out — with a page snapshot showing exactly the tell (`textbox "Authenticator
code" [invalid]` + `alert: required` + `button "Verify" [disabled]`, i.e. the
alert that caused the reflow).

So the rule is not "auth page *links*" but **"any control on an auth form that
sits below an autofocused, validated input"**. Fix in
`support/multi-factor-auth.ts clickAuthTextButton(page, name, expected)`: retry
click-then-assert in a `toPass`, gated on the button's own **name**. Both
buttons relabel after a successful activation ("Use an authenticator code
instead" / "Resend code"), so the exact-name locator stops matching and the
retry can never toggle back — which is what makes the retry safe here and is
worth stating as the general pattern for retrying a toggle.

Suggested `PORTING.md` wording (extend the wave-5/signin entry):

> **Auth-form reflow drops the first real click — not just on links.** Any
> control below an autofocused validated input on `/auth/*` can move between
> mousedown and mouseup when the blur renders a "required" alert. Retry
> click-then-assert, and gate the retry on something that *stops matching* once
> the click lands (usually the control's own relabelled name) so re-clicking a
> toggle can't undo it.

## Vacuous / weakened upstream assertions (1)

**`H.getInbox()` with no count is a race, and the `to.exist` after it is what
pays for it.** `getInboxWithRetry` resolves as soon as the inbox is *non-empty*.
In both email tests the inbox already holds the "2FA enabled" enrollment
notification when the wait starts, so the poll returns immediately — before the
sign-in-code / password-reset email has necessarily been sent (the backend sends
on a background thread). The subsequent `expect(otpEmail).to.exist` is then a
coin flip on backend timing, not an assertion about the app. Upstream half-knew
this: test 6 works around it with `H.getInbox(2)` (wait for *exactly* two
emails), which is the same guess by another route — it breaks the other way if a
third email ever lands.

Ported both as `waitForEmail(email => email.subject.includes(…))`
(`support/onboarding-extras.ts`), which asserts the same fact — "the email under
test was sent" — deterministically. Strictly stronger than upstream, and it also
removed the need for the `getInbox(2)` comment.

Also strengthened, minor: upstream's `expect(code).to.be.a("string")` accepts
any string the regex produced. Ported as `expect.stringMatching(/^\d{6}$/)`.

## Harness note — maildev, and why the gate is conditional

Two tests need maildev (`:1025` SMTP / `:1080` web). Docker was not running on
this box, so they were executed against `bunx maildev@2.0.5 -s 1025 -w 1080`,
which is a drop-in for the container the Cypress helper documents. **Version
matters**: bare `bunx maildev` installs 3.x, which moved the REST API to
`/api/email`; `support/onboarding-extras.ts` (correctly, matching
`e2e-email-helpers.js`) reads `/email`, so 3.x answers 404 and
`isMaildevRunning()` reports false — the tests silently gate-skip and look
"green". **Anyone verifying an email spec without Docker must pin
`maildev@2.0.5`, or they will report a pass they never ran.** Worth a line in
PORTING's environment facts.

The maildev process was stopped again after verification (it is a shared,
box-global resource — a sibling agent's `clearInbox()` would wipe another's
inbox, the same contention class PORTING records for snowplow-micro).

`beforeEach`'s `clearInbox()` is wrapped in `isMaildevRunning()` rather than run
unconditionally as upstream does. Its only purpose is isolating the two email
assertions, and running it unconditionally would make all 8 tests depend on
maildev. Deliberate, documented in the spec header.

## Notes on things that were checked and turned out to be non-issues

- **TOTP / clock.** The brief flagged time handling. Nothing in this spec touches
  a mock clock — no `cy.clock`, no `/api/testing/set-time` — so neither the
  cumulative-set-time behaviour nor `TZ=US/Pacific` is load-bearing here. (Runs
  were done under `TZ=US/Pacific` anyway.) The one real time subtlety is the
  backend's replay protection: `mfa.enrollment` records the accepted time step
  and rejects anything at or before it, while `mfa.totp/matching-time-step`
  accepts ±1 step, which is precisely why upstream generates from
  `Date.now()/1000 + 30` after a code has already been consumed. Ported verbatim
  and documented on `generateTotpCode`.
- **Throttling.** `mfa.throttling` could plausibly lock the user out across the
  repeated bad-code attempts in test 4. It cannot: `POST
  /api/testing/reset-throttlers` calls `reset-mfa-throttlers-for-testing!`
  (`src/metabase/testing_api/api.clj:261`) and `mb.api.restore()` posts it
  first thing in every `beforeEach`.
- **`mfaToggle` accessible name.** `SettingHeader` renders
  `<label for="mfa-enforcement">Two-factor authentication</label>` and the
  Mantine `Switch` renders a *second* label ("Enabled"/"Disabled") for the same
  id, so the computed name is the concatenation. Upstream's
  `findByLabelText(/Enabled|Disabled/)` works because testing-library matches
  per-label; Playwright's `getByLabel(/Enabled|Disabled/)` works because the
  regex is unanchored. Kept as-is (faithful, and it keeps the implicit
  Enabled/Disabled label check that `getByRole("switch")` would have dropped).

## Consolidation debt

- `button(scope, name)` in `support/multi-factor-auth.ts` is yet another
  re-implementation of `cy.button` (exact-name `getByRole("button")`, with a
  regex passthrough). Several port modules carry a private copy. Cypress has
  exactly one `cy.button`, so unifying it into `support/ui.ts` stays faithful —
  add to the consolidation list.
- `clickAuthTextButton` and `support/signin.ts clickAuthLinkExpectUrl` are the
  same reflow workaround for the same page, differing only in role and gate.
  Fold into one `support/signin.ts` helper at consolidation time.
- `loginPage(page)` (`getByTestId("login-page")`) is trivially duplicated across
  auth ports; belongs next to the signin helpers.
