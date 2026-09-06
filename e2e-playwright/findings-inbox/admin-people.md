# admin-people (e2e/test/scenarios/admin-2/people.cy.spec.js → tests/admin-people.spec.ts)

## Pre-flight collision checks

- **Same-basename siblings in the source dir**: none. `ls e2e/test/scenarios/admin-2/`
  shows exactly one `people.cy.spec.js` and no `people.cy.spec.ts`. (The
  `visualizations-charts-reproductions` hazard does not apply here.)
- **Existing target**: none. `tests/admin-people.spec.ts` did not exist, nor did
  `findings-inbox/admin-people.md`. Nothing overwritten.

## Infra tier — the brief's classifier was wrong again (5th time)

**This is the email-SETTINGS tier, and as ported it has NO container dependency
at all.** Not QA-DB (`PW_QA_DB_ENABLED` is irrelevant — nothing restores a
`*-writable` snapshot or touches an external SQL container), and — the
non-obvious part — **not even the maildev tier**.

Three tests want SMTP:

| test | upstream |
|---|---|
| `should reset user password with SMTP set up` | `@external` + `H.setupSMTP()` |
| `email configured` describe → `invite member when SSO is not configured` | `@external` + `H.setupSMTP()` |
| `invite member when SSO is configured metabase#23630` | **untagged**, but calls `H.setupSMTP()` |

None reads an inbox. Each asserts FE copy gated purely on the
`email-configured?` session property, which the backend derives as
`(boolean (email-smtp-host))` — `src/metabase/channel/settings.clj:301`,
`:setter :none`. And the password-reset send happens inside a `future`, so
`POST /api/session/forgot_password` answers 204 whether or not an SMTP server
is reachable (`src/metabase/session/api.clj:263-311`).

So all three use `configureSmtpSettings` (support/admin-extras.ts) instead of
`setupSMTP`. **Three would-be gate-skips converted into real executed
coverage**, and the spec runs on a bare jar. `maildev` being up on this box is
incidental; the port never talks to :1080 or :1025.

`H.getInbox()`'s non-empty-return trap did not apply — nothing here polls an
inbox.

Container evidence: **n/a** (no DB or mail-server dependency).

## Executed vs gate-skipped

Verification loop, jar confirmed (`/api/session/properties` `version.hash`
`751c2a9` == `target/uberjar/COMMIT-ID` `751c2a98`).

| run | result |
|---|---|
| gate ON, 1× | **25 passed, 1 skipped, 0 failed** (41.8s) |
| gate ON, `--repeat-each=2` | **50 passed, 2 skipped, 0 failed** (1.5m) |
| **gate OFF** (`MB_PRO_SELF_HOSTED_TOKEN=""` + `CYPRESS_…=""`) | **19 passed, 7 skipped, 0 failed** (29.3s) |
| `bunx tsc --noEmit` | clean |

26 tests total. The permanent skip is `issue 23689` — upstream's `beforeEach`
opens with `cy.skipOn(true)` and a "remove when this issue gets fixed" TODO, so
it has never run. Ported as `test.describe.skip` with the body intact so the
skip stays honest about what it covers.

The gate-OFF delta (7 skipped) is the 6 EE tests + that one. State restoration
is clean: two consecutive full runs and a `--repeat-each=2` all green, so the
slot is not poisoned by the users/groups/memberships these tests create.

### The gate-OFF control did real work

`should not offer to reset passwords when password login is disabled` sits in
an **untagged, non-EE describe** but calls `H.activateToken("pro-self-hosted")`
upstream. Without a token `activateToken` throws on the missing env var, so the
first control run reported **1 failed instead of 1 skipped** — the exact
"reads as the port being broken without the gate" shape PORTING warns about.
Fixed with a per-test `test.skip(!resolveToken("pro-self-hosted"), …)`; the
control is now 19/7/0. **This is the only fix the whole port needed**, and only
the control could have found it.

## Email tests, separately

All three ran and passed, gate ON and gate OFF alike (none of them is EE-gated):

- `should reset user password with SMTP set up` — ✅ executed
- `invite member when SSO is not configured` — ✅ executed
- `invite member when SSO is configured metabase#23630` — ✅ executed (EE
  describe, so it skips in the gate-OFF control)

Each was mutation-proven load-bearing on the SMTP config (below), so these are
not FINDINGS #49 "green runs that never executed".

## Mutation testing — 25 mutants, 23 killed, 2 survivors (both explained)

Every mutant inverts an **input** (fixture data, a settings write, or an action
the assertions do not name), never an expectation. Where each died is recorded,
and 8 of them were aimed specifically at **tails** after the first batch showed
several dying at assertion #1.

### Killed (23)

| mutant | input inverted | died at |
|---|---|---|
| `extra-user` | +1 user in `beforeEach` | T1 row count (first assertion) **and** T14's *final* footer assertion (tail) |
| `extra-group` | +1 group | T1 `TOTAL_GROUPS` row count (mid) |
| `drop-collection-member` | remove `impersonated` from `collection` | T1 "collection row contains 4" (mid) — `Received "Ccollection3"` |
| `drop-data-member` | remove `nocollection` from `data` | T1 "2 members" (deep mid) |
| `no-deactivate-1` | skip the Deactivate confirm | T1 "1 member" (**tail**) |
| `no-admin-group-5` | don't pick the Administrators group | T5 "Admin" badge in the row (**tail**) |
| `wrong-user-7` | open `normal`'s menu, not the admin's own | T7 "Deactivate user should not exist" — **proves the absence check is not vacuous** |
| `no-deactivated-tab-8` | skip the "Deactivated" filter click | T8 reactivate flow (**tail**) |
| `no-blank-9` | type "Jane" instead of " " | T9 `/non-blank string./` (mid) |
| `wrong-name-9` | type "Jack" while asserting "John" | T9 `NEW_FULL_NAME` (**tail**) |
| `smtp-10` | *add* SMTP to the no-SMTP test | T10 temp-password modal (**tail**) |
| `no-pwlogin-12` | skip `enable-password-login: false` | T12 "Reset password not offered" — **proves the absence check is not vacuous** |
| `no-smtp-13` | skip `configureSmtpSettings` | T13 "Password reset email sent to …" toast (**tail**) |
| `no-remove-group-15` | Escape instead of confirming Remove | T15 delete wait + absence (**tail**) |
| `no-apikey` | don't create the API key | T16 "(includes 1 API key)" (first) |
| `two-apikeys` | create a **second** API key | T16 "Remove group and API key" singular copy (**tail**) |
| `users-17` | generate 17 users, not 18 | T19 and T20 page-2 counts (**tails**) |
| `no-smtp-18` | skip `configureSmtpSettings` | T18 "instructions to set their password" (**tail**) |
| `no-sso-22` | skip `enable-password-login: false` | T22 "instructions to log in …" (**tail**) |
| `collection-group-1` | open `collection` instead of `All Users` | T1 "Add members should not exist" — **proves that absence check is not vacuous** |
| `no-manager-promo` | skip promoting `normal` to group manager | all 3 group-manager tests, in the `beforeEach` |
| `no-add-member-23` | skip adding `No Collection` to the group | T23 user row (mid) |
| `no-add-collection-24` | skip the "add to collection" click | T24 (mid/tail) |

Three separate **absence** assertions were probed head-on (`wrong-user-7`,
`no-pwlogin-12`, `collection-group-1`) and all three died — the security-shaped
ones in this spec are real.

### Survivor 1 — `no-scroll-17`: bad mutation, assertion is sound

Removing the `scrollTo("bottom")` from "should display more than 50 groups
(metabase#17200)" left the test green. That is a **bad mutation**, not vacuity:
the load-bearing input is the 51 generated groups, not the scroll.

Answered by asserting presence under the same conditions (`probe-17`, measured):

```
PROBE-17 rows=57 readonlyIndex=56 first3=["A\nAdministrators","A\nAll Users","C\ncollection"]
```

`readonly` is the **57th of 57 rows**, i.e. well past the 50-item cap the issue
was about — so the assertion genuinely discriminates. The scroll is decorative
in Cypress too (`findByText` has no visibility requirement); it is ported
because it is faithful, not because it enforces anything.

### Survivor 2 — `no-unsubscribe-21`: a REAL upstream vacuity 🔴

Replacing the "Unsubscribe" click with an `Escape` — i.e. **never unsubscribing
at all** — leaves `should unsubscribe a user from all subscriptions and alerts`
**green**. The entire subject of the test can be deleted without it going red.

Answered with the presence probe: under the same mutation,
`expect(getByText("Question")).toBeVisible()` and the same for "Dashboard"
**both pass** (`probe-21`). So the content is there and the absence checks are
sampling too early.

Mechanism, **measured** rather than inferred (`probe-21b`, on the jar):

```
PROBE-21B bellVisibleAt=68ms questionVisibleAt=134ms
```

The intended anchor is part of the loading state. `NotificationList.tsx:78-94`
renders `NotificationEmptyState` — the **only** source of the `bell icon`
label — whenever `items.length === 0`, which includes the pre-fetch window. So
the bell paints at +68ms and the notification card at +134ms, and all three of

```js
cy.findByLabelText("bell icon");
cy.findByText("Question").should("not.exist");
cy.findByText("Dashboard").should("not.exist");
```

are satisfied inside that 66ms gap.

**This is an upstream hole, not port drift.** Cypress's `should("not.exist")`
and Playwright's `toHaveCount(0)` have identical first-absent-observation
semantics, and the anchor is equally useless in both. Per the faithfulness
rule the port keeps all three assertions verbatim with the analysis inline
rather than shipping a silently strengthened test. **A follow-up should anchor
on a signal that only exists post-fetch** (the empty-state *copy*
"If you subscribe or are added to dashboard subscriptions…" has the same
problem; the honest anchor is the `GET /api/pulse` + notification responses the
page fires, which `openUserNotifications` in support/onboarding-extras.ts
already knows how to wait for).

This is the sixth vacuous upstream assertion found by mutation testing on this
programme, and the second where the *anchor itself* was the loophole.

## Gotchas encountered (none new, all from the brief/PORTING — recorded as confirmations)

- **MultiAutocomplete/PillsInput blur trap — confirmed live.** The group
  "Add members" flow re-opens its suggestion `Popover` after a pick
  (`AddMemberRow` does `setText("")`, and `opened={suggestedUsers.length > 0}`
  is then true for *every* remaining user). The port blurs the input before the
  "Add" click. Two sites: T1 and T23.
- **CSS-hover-gated control — confirmed.** `UserTypeCell.module.css` puts the
  membership-type toggle in a `visibility: hidden` span unhidden only by
  `.cell:hover`, which is why upstream `realHover()`s the "Member"/"Manager"
  text. Ported as a real `hover()` on the cell then a normal click
  (`toggleUserTypeInRow`). It works because the toggle is *inside* the hovered
  cell, so the parked-cursor inversion does not bite. Note the **same component
  inside `MembershipSelect`'s popover is NOT hover-gated** — the wrapper span
  only exists in `UserTypeCell`. Two different call sites, two different
  treatments.
- **`cy.get()` resets the subject.** `assertTableRowsCount` is
  `cy.findByTestId("admin-layout-content").get("table tbody tr")` — the testid
  half is dead code and the executed selector is page-wide. Ported as
  page-wide + an explicit visibility assertion for the anchor's implicit
  existence requirement.
- **Avatar initial in the accessible name — confirmed, and it did NOT bite.**
  Group name links compute as `"C collection"` (measured in the mutation output:
  `Received string: "Ccollection3"`). Upstream dodges it by using
  `findByText("collection")` (which hits the inner `<span>`, not the link) and
  `findByRole("link", { name: /data$/i })` (a regex, which still matches
  `"D data"`). Both port across unchanged.
- **`cy.contains(str)` yields the DEEPEST match.** For
  `cy.contains("People").should("have.attr", "data-active", "true")` that is the
  Mantine `NavLink` *label span*, while `data-active` lives on the NavLink
  **root** (`@mantine/core` `NavLink.mjs:118` — `mod: [{disabled, active, …}]`).
  Ported against the root link, which is the assertion's evident intent. Noted
  as a deviation in the spec header. *I did not determine how the upstream
  assertion passes against the label span — recorded as unexplained rather than
  invented.*

## Fixmes

**None.** No `test.fixme`, no weakened assertion, no Cypress cross-check run
(the brief's standing rule — four sibling slots were live throughout).

## Files

- `e2e-playwright/tests/admin-people.spec.ts` (26 tests)
- `e2e-playwright/support/admin-people.ts` (spec-local helpers; no shared
  support module was edited)

## Summary (3 lines)

Ported all 26 tests of `admin-2/people.cy.spec.js` green on the CI jar —
25 passed / 1 permanently-skipped upstream, 50/50 under `--repeat-each=2`,
tsc clean, one fix needed (a missing token gate, found by the gate-OFF control).
The tier is **email-settings only, not QA-DB and not maildev**: swapping
`H.setupSMTP` for `configureSmtpSettings` turned three would-be gate-skips into
real coverage and left the spec with zero container dependencies.
25 mutants killed 23 (8 aimed at tails, all 8 dead there); of the 2 survivors
one was a bad mutation with the assertion proven sound, and the other exposed a
**genuinely vacuous upstream test** whose entire unsubscribe action can be
deleted without it going red — measured at 68ms vs 134ms paint, ported verbatim
with the analysis inline.
