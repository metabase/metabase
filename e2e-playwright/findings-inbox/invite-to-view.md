# invite-to-view

Source: `e2e/test/scenarios/sharing/invite-to-view.cy.spec.js` (184 lines, 6 tests)
Target: `e2e-playwright/tests/invite-to-view.spec.ts` + `support/invite-to-view.ts`

**Result: 6/6 executed and passing on the CI uberjar (751c2a9), 12/12 under
`--repeat-each=2`. 0 skipped, 0 fixme. No product-bug claims.** Zero port
fixes were needed — the spec went green on its first run.

## Coverage honesty

All four email-dependent tests genuinely executed. Maildev was started pinned
at `bunx maildev@2.0.5` (SMTP :1025, web :1080) for the run and stopped
afterwards; `isMaildevRunning()` probed the 2.x `/email` path successfully, so
none of the `test.skip` gates fired. Backend confirmed as the jar
(`/api/session/properties` `version.hash` = `751c2a9` = `target/uberjar/COMMIT-ID`,
no `*.hot.bundle.js` served, process is `java -jar target/uberjar/metabase.jar`).

The `pro-self-hosted` token gate on the SSO test also did not fire — the token
resolved from `cypress.env.json` and the test ran for real.

## Dividends

**One, and it is a re-confirmation of an already-documented class rather than a
new discovery: the `H.getInbox()` race.** Upstream reads every invite with

```js
H.getInbox().then(({ body: [email] }) => { expect(email.subject)… });
```

`H.getInbox()` resolves as soon as the inbox is *non-empty* and the assertion
then runs against `body[0]`. The backend sends invite mail on a background
thread (`send-email!` wraps a future), so the resolution instant is not tied to
the email under test. Upstream is saved only by `H.setupSMTP()` clearing the
inbox first, which makes the invite the sole possible occupant — i.e. the test
is correct by an incidental property of the setup helper, not by construction.
The port waits on `emailAddressees(sent).includes(<this test's random invitee>)`,
which is unambiguous regardless of what else is in the inbox. Same assertion,
no timing dependence. (Matches the PORTING batch-12 gotcha and the
multi-factor-auth finding; recorded here because this spec has four instances
of it.)

**A near-miss worth recording rather than a dividend:** `joinUrlFromEmail`
upstream does `sent.html.match(/…/)[1]` with no null guard, so a missing join
link surfaces as `TypeError: Cannot read properties of null` rather than a
readable failure. The port asserts the match exists first. Cosmetic — it does
not change what is enforced.

## Non-findings (checked, nothing there)

- **No vacuous upstream assertions.** Every `expect` in the original enforces
  something real, including the negative `expect(email.html).not.to.contain("reset_password")`
  in the SSO test — verified non-vacuous by the fact that the non-SSO tests'
  emails *do* contain `reset_password` (the landing-after-signup tests extract
  their join URL from exactly that substring, on the same template).
- **Tests 1 and 2 need no SMTP at all.** With email unconfigured the modal
  falls through to `inviteWithTemporaryPassword` (`InviteToViewModal.tsx:122`),
  which still `POST`s `/api/user` with the `invite_target` — the only thing
  those two tests assert. So no maildev dependency was inherited unnecessarily,
  and no `configureSmtpSettings` swap was applicable: the other four tests all
  read the inbox for real.
- Nothing environmental was hit — no site-url, sample-DB, or CSS-module-class
  traps in this spec.
