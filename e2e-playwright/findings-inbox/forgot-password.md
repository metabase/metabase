# forgot-password (onboarding/auth/forgot_password.cy.spec.js → tests/forgot-password.spec.ts)

49 lines, 2 tests. **2/2 genuinely executed and green on the CI uberjar
(`target/uberjar/metabase.jar`, COMMIT-ID `751c2a98`); 6/6 under
`--repeat-each=3`, and 10/10 on an earlier `--repeat-each=5`. `bunx tsc --noEmit`
clean. No fixmes, no skips, no product-bug claims.**

Slot 5 / :4105, jar mode throughout. Both tests executed against the live
maildev container — neither was gate-skipped.

**Backend verified BY IDENTITY, not by `JAR_PATH`:** `lsof -nP -iTCP:4105` →
`java` pid 60090 LISTEN; `/api/session/properties` → `version.hash = 751c2a9`
vs `target/uberjar/COMMIT-ID = 751c2a98`. Same artifact.

---

## Filename note (asked for explicitly)

The Cypress source is **`forgot_password.cy.spec.js`** (underscore); the port is
**`tests/forgot-password.spec.ts`** (hyphen). This is deliberate and matches the
suite-wide hyphen convention. The *route* keeps the underscore
(`/auth/forgot_password`) because that is the real product URL — the underscore
survives in the code, just not in the filename.

**Support module: `support/forgot-password.ts`** — i.e. exactly the expected
name. Nothing to flag loudly here.

## Collision checks

`grep -rl "forgot_password\|forgot-password" tests/ support/` → three hits, all
inspected, **none is a port of my source**:

- `tests/signin.spec.ts` — ports the *redirect* `/auth/forgot_password` →
  `/auth/login` (metabase#12658). Different source spec.
- `tests/admin-people.spec.ts` — a comment about `POST /api/session/forgot_password`
  answering 204 regardless of SMTP config. Comment only.
- `tests/multi-factor-auth.spec.ts` — **drives nearly this exact flow** (request
  reset → read email → set password) as part of "resetting a forgotten password
  does not bypass the second factor". It is a port of the *MFA* spec, not mine.

I read all three read-only and edited none. No shared support module was
touched; `PORTED.txt` / `QUEUE.md` / `playwright.config.ts` untouched; nothing
committed; port 4000 never contacted.

Reuse decisions: `setupSMTP` / `getInbox` / `waitForEmail` / `emailAddressees` /
`isMaildevRunning` imported read-only from `support/onboarding-extras.ts`;
`icon` / `appBar` from `support/ui.ts`. `getResetLink` was **re-ported** into my
support module rather than imported from `support/multi-factor-auth.ts` (which
has an identical copy) because it is a *spec-local* helper in both Cypress
originals — each port owns one.

---

## 🔴 How I isolated the email assertion from the shared maildev inbox

This was the flagged top risk, and it is real: **mid-session I watched the
shared inbox go to 0 while I was probing it**, because a sibling slot's
`setupSMTP` issued its `DELETE /email/all`. Upstream does
`H.getInbox().then(({ body: [{ html }] }) => …)` — it takes **inbox entry 0** and
trusts that its own DELETE left only its own mail there. In this harness that
is false in both directions: siblings add mail we might read, and siblings
delete mail we need.

`waitForOwnResetEmail` (support/forgot-password.ts) matches on four conjuncts:

1. `id` not in a snapshot taken **immediately before the click**;
2. subject contains `Password Reset Request`;
3. **the body links at our own per-slot site URL**;
4. recipient is the address we asked for.

**Conjunct 3 is the decisive one, and it is verified by mechanism, not assumed.**
`forgot-password-impl` in `src/metabase/session/api.clj` builds the link as
`(system/site-url) + "/auth/reset_password/" + token`, and
`support/worker-backend.ts:265` pins `MB_SITE_URL: http://localhost:${port}` per
slot. Live confirmation on :4105 — I POSTed `/api/session/forgot_password` by
hand and tight-polled maildev:

```
subj='[Metabase] Password Reset Request'  to=['admin@metabase.test']
origin=http://localhost:4105   (token redacted)
```

`/api/session/properties` likewise reports `site-url: http://localhost:4105`. So
a reset mail from slot N carries `:410N` and cannot be confused with ours.

The brief's `MB_SITE_URL` warning said to *check rather than assume* — checked,
and it holds. I used the `baseURL` fixture rather than hardcoding `4105`, so the
predicate follows whatever slot the test lands on.

Both conjuncts 1 and 3 were then proven non-vacuous by mutation (M1, M5 below) —
neither is decoration.

## Did maildev actually engage, and how I probed it

**Yes.** I used the mechanism probe the brief specified — `PUT /api/email`
live-connects before saving:

```
PUT /api/email port=1026 -> 400   {"errors":{"email-smtp-host":"Wrong host or port", …}}
PUT /api/email port=1025 -> 200
```

So `setupSMTP` is a genuine dependency, not decorative. Real SMTP delivery was
also observed end-to-end (the probe above).

`maildev-ssl` is **inapplicable by mechanism**, not merely unobserved:
`setupSMTP` sends `"email-smtp-security": "none"` and port 1025, so the SSL
listener is never addressed by this code path.

**Snowplow: zero on this path** (the accurate form of the claim). `forgot-password-impl`
publishes `:event/password-reset-initiated`, whose only consumers are
`audit_app/events/audit_log.clj` (derived as `::user-event`) and
`audit_app/models/audit_log.clj`. `grep` over `src/metabase/analytics/` for
`password_reset|password-reset` returns nothing. I did not check Prometheus
counters on this path and make no claim about them.

## Gate mapping, with the gate-OFF control

Upstream tags the describe `{ tags: "@external" }`. The `beforeEach` is
`H.restore(); signInAsAdmin(); H.setupSMTP(); signOut()` — so the external
dependency is the maildev container, pulled in for **both** tests.

Ported as `test.skip(!(await isMaildevRunning()), …)` in the `beforeEach`.
**`beforeEach` is safe here rather than describe level because the describe has
no `afterEach`** — I checked; there is none to strand.

Two controls, both run:

- **Control A — gate forced OFF** (`isMaildevRunning` stubbed `false`): both
  tests reported `-` → **2 skipped**, 0 executed.
- **Control B — gate removed, maildev unreachable** (dead SMTP port 1026): both
  tests **failed** in `beforeEach` with
  `PUT /api/email -> 400 {"errors":{"email-smtp-host":"Wrong host or port"}}`,
  thrown by `support/api.ts:47` (`failOnStatusCode` defaults true).

So, against the brief's warning that an `@external` tag has gated *precisely
nothing* eight times: **here it is load-bearing, for both tests.** Note the
second test never reads email, yet still needs maildev — for two independent
reasons: the `PUT` throws, and (found incidentally, see below) `ForgotPassword.tsx`
renders the *disabled* view without email configured.

Gate-ON (normal): **2 executed, 0 skipped.** Gate-OFF: **0 executed, 2 skipped.**

## Every absence assertion and its positive anchor

There is exactly one absence assertion upstream, and it turned out to be vacuous.

| Absence assertion | Positive anchor |
|---|---|
| `expect(icon(page,"gear")).toHaveCount(0)` (verbatim port of `cy.icon("gear").should("not.exist")`) | `forgotPasswordTitle` visible **and** `emailAddressInput` visible, both asserted first |
| `expect(appBar(page)).toHaveCount(0)` (**declared strengthening**) | same two anchors |

### 🔴 The upstream assertion is VACUOUS — and I proved it, then strengthened

`.Icon-gear` matches **zero elements anywhere in this build**, so
`should("not.exist")` can never fail. Evidence — an app-bar dump on `/` while
signed in as admin:

```
Icon-* on /: Icon-burger, Icon-search, Icon-add, Icon-metabot, Icon-mode,
             Icon-home, Icon-chevrondown, Icon-add_data, Icon-learn, …
.Icon-gear count on /:                        0
svg[aria-label='gear icon'] count on /:       0
gear/settings-ish labels on /:                ["Settings"]
```

The settings entry point exists but is labelled `Settings` and carries no `gear`
icon class. So the test named "should not show the app bar" was not, in fact,
testing that the app bar is absent.

Per the hard rule (vacuous upstream → **verbatim with analysis inline**) I kept
the `.Icon-gear` assertion exactly as ported, with the analysis in a comment
next to it. Alongside it I added — **and I am flagging this explicitly as a
strengthening** — `expect(appBar(page)).toHaveCount(0)`, which asserts what the
test is named for. It is presence-probed as a real discriminator:

```
appBar (getByLabel "Navigation bar") count on /:                       1
appBar count on /auth/forgot_password:                                 0
```

## Mutation testing

**Verifier sanity-checked BEFORE use**, per the brief. The harness
(`scratchpad/s5-forgot-password-mutate.py`) validates before any write and
aborts on: target absent, target ambiguous (>1 occurrence), no-op, file not
pristine, or md5 unchanged after write. All four guards were exercised against
deliberately-bad inputs and all four fired:

| Sanity case | Result |
|---|---|
| S1 target absent | `ABORT: mutation target not found` — files untouched |
| S2 target ambiguous (`await expect(`, 5×) | `ABORT: ambiguous (5 occurrences)` — untouched |
| S4 true no-op, unique string | `ABORT: no-op mutation` |
| S5 positive control (valid mutation) | md5 changed `963f…` → `c5f8…`, then **restored byte-identical** |

(S3 was a bad sanity case of mine: I picked `admin.email` to test the no-op
guard, but it occurs twice, so it tripped the *ambiguity* guard first and left
the no-op guard untested. S4 redid it with a unique string.)

### Results — 5 mutations, 5 killed

| # | Mutation (input inverted) | Outcome | **Where it died** |
|---|---|---|---|
| M1 | isolation site URL → another slot (`:4101`) | **killed** | `waitForOwnResetEmail`, `spec:82` |
| M2 | request reset for an address with **no user** | **killed** | `waitForOwnResetEmail`, `spec:82` |
| M3 | *(over-determined — see below)* | killed, but uninformative | positive anchor, `spec:108` |
| M3b | presence-probe `.Icon-gear` on `/` | **survived → vacuity proven** | n/a |
| M4 | confirm-password filled with a mismatch | **killed** | toast assertion, `spec:96` |
| M5 | invert `!excludeIds.has(id)` in the predicate | **killed** | `waitForOwnResetEmail`, `spec:86` |

Every mutation was confirmed landed (md5 changed) and **every one restored
byte-identical** (verified by md5 after each run). Final state:
`tests/forgot-password.spec.ts` = `66512cf4…`, `support/forgot-password.ts` =
`0b6e0fd6…`.

**M1 is the money shot for the isolation claim.** The failure message was:

```
No email matched within 15000ms; inbox subjects: [[Metabase] Password Reset Request]
```

The reset email **was sitting in the inbox** — subject and recipient both
matched — and was rejected purely by the site-URL conjunct. That is direct proof
that conjunct 3 discriminates and is not vacuously true, which is exactly the
property that makes the test safe against sibling slots.

**M2 is the informative one about where the discriminating power lives.** With a
nonexistent recipient the test died at the *email* wait with an **empty inbox** —
but the `/If the email exists/` success message assertion **passed first**. That
is by design (the endpoint 204s regardless, to avoid account enumeration), so
the success-message assertion **cannot distinguish a real address from a fake
one**. This is a "the data cannot discriminate" survivor, not a vacuous one: all
the evidence that the reset actually worked lives in the email read and the
final toast. Worth knowing — the success message alone would be a weak test.

**M3 was a bad mutation of mine, and I'm calling it out** as the brief asks. I
tried to presence-probe the gear by re-pointing the test at `/`, but that also
destroys the positive anchor (`Forgot password` isn't on `/`), so it died at
`spec:108` on the anchor and never reached the gear assertion — **over-determined
and uninformative about the thing I was probing**. M3b retargeted the single
gear line instead and gave the real answer (vacuous).

**M5** proves the pre-send snapshot is genuinely consulted: inverted, the
predicate can only match something that existed *before* the click, and it
correctly matched nothing. Note this conjunct guards a case conjunct 3 does
*not* — my own previous repeat's email, which carries the same site URL,
recipient and subject.

## Runtime as a tell — a suspicious green, probed

Test 1's duration was **bimodal and alternating**: 6.7s / 1.6s / 6.7s / 1.7s /
6.7s. That is a deterministic ~5.0s step, not load noise, so I instrumented it
rather than shrug.

**All 5s is inside `setupSMTP`'s single `PUT /api/email`.** Phase timings:

```
restore 99ms | signInAsAdmin 2ms | setupSMTP 5123ms  ← slow run
restore 97ms | signInAsAdmin 2ms | setupSMTP  119ms  ← fast run
goto 408ms | fill+snapshot 100ms | click+msg 45ms
waitForOwnResetEmail 257ms  (steady across every run)
goto reset link 140ms | fill 120ms | save+toast 335ms
```

Reproduced **outside Playwright entirely**, with plain curl against :4105:

```
PUT /api/email #1 -> 200 in 5.124s
PUT /api/email #2 -> 200 in 0.123s
… #3–#6 all ~0.117s
```

So: a backend-side cold path in the SMTP validation, first call after an idle
gap, ~5.0s flat; nothing to do with my port, and it affects **every** email spec
in the suite through the shared `setupSMTP`.

**What I ruled out**, rather than guessed: (a) my test code — the 5s is wholly
inside one API call made before any assertion; (b) email delivery latency —
`waitForOwnResetEmail` is a steady ~257ms in both modes; (c) **IPv6/IPv4
fallback on `localhost`**, which was my first hypothesis and is **wrong**:
maildev binds `*:1025` via Docker and both `::1` and `127.0.0.1` connect in 0ms.

**I did not identify the actual mechanism, and I am not going to invent one.**
I could write a plausible story about a connection-test cache or a JavaMail
read-timeout; I'd rather this be recorded as an open question. What is
established is the location (backend `PUT /api/email`), the shape (~5.0s flat,
cold-only), and that it is independent of the harness.

## Vacuous / weakened upstream assertions

1. **`cy.icon("gear").should("not.exist")` — vacuous.** Full analysis above.
   Kept verbatim; strengthening added and declared.
2. **`cy.findByText(/If the email exists/)` with no `.should()`** — not vacuous,
   just implicit: testing-library throws on no match, so it is an existence
   assertion. Ported as `toBeVisible()`. But see M2: it cannot tell a real
   address from a fake one, by design.
3. **`H.getInbox()` entry-0 read** — unsound in a shared-inbox harness, replaced
   as described. Strictly stronger than upstream.

## Porting-rule traps checked

- **`getByText` breadth (the flagged one).** The brief warned that
  `{exact:false}` ignores case and had matched `"Password"` inside *"I seem to
  have forgotten my password"* — literally this spec's surface. All string
  `findByText`/`findByLabelText` ports use `{ exact: true }` (rule 1). The one
  regex, `/If the email exists/`, is a regex upstream too, and Playwright regex
  matching is case-sensitive absent an `i` flag. Both resolved to a single
  element (no strict-mode violation across 10 runs).
- **`findByText` → `getByText`, not `getByRole("button")`.** Kept faithful for
  "Send password reset email" and "Save new password". These are
  `FormSubmitButton`s whose label swaps to `Success`/`Failed` by status, so the
  text is meaningful. Resolved uniquely in practice.
- **Formik `dirty`-gated submit / placeholder traps** — **inapplicable by
  mechanism.** `useFormSubmitButton` here is not gated on `dirty`, and neither
  form has a derived-sibling placeholder; plain `fill()` submits both, confirmed
  over 10 clean runs. No `pressSequentially` workaround needed.
- **`should("be.enabled")` / `.contains()` innermost / `cy.wait("@alias")` /
  `cy.intercept` empty body** — none of these constructs appear in the source.
- **Toast, not inline copy.** `You've updated your password.` is `sendToast` in
  `ResetPassword.tsx`, so it renders in the undo-list on `/` after the
  post-reset redirect. Asserted immediately after the click; M4 confirms it has
  teeth.

## Incidental finding

`ForgotPassword.tsx` gates on `canResetPassword = isEmailConfigured && !isLdapEnabled`.
Without SMTP configured the route renders `ForgotPasswordDisabled` ("Please
contact an administrator…") — **no title, no email field**. I hit this while
probing (a probe that skipped `setupSMTP` failed to find the title) and it is a
second, independent reason the email gate is load-bearing for test 2. Upstream
never exercises the disabled view.

## Fixmes

None.

---

## Summary

Both tests are faithful, green on the CI uberjar (2/2, and 6/6 under
`--repeat-each=3`), tsc-clean, with no fixmes; the `@external`/email gate is
load-bearing for both tests and was confirmed by a two-way gate-OFF control.
The shared-maildev risk is handled by matching the reset link against this
slot's pinned `MB_SITE_URL` — verified live and proven non-vacuous by a mutation
that rejected the correct email sitting in the inbox.
Upstream's `cy.icon("gear").should("not.exist")` is **vacuous** (`.Icon-gear`
matches nothing anywhere); it is kept verbatim with analysis and backed by a
declared, presence-probed strengthening on the app bar.
