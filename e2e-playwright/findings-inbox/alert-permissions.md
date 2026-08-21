# alert-permissions — port findings (slot 2, port 4102)

Source: `e2e/test/scenarios/sharing/alert/alert-permissions.cy.spec.js` (169 lines)
Target: `e2e-playwright/tests/alert-permissions.spec.ts`
Support module: **`support/alert-permissions.ts`** — matches the expected name, no
deviation to report.

Jar verified BY IDENTITY, not by `JAR_PATH`: `version.properties` inside
`target/uberjar/metabase.jar` reads `hash=751c2a9` (expected `751c2a98`), and the
running JVMs in `ps` are `java -jar .../target/uberjar/metabase.jar`.

## Collision checks

- `grep -rl "alert-permissions" tests/ support/` → **no hits**. No prior port of
  this source exists.
- `ls tests/ support/` → `tests/alert-permissions.spec.ts` and
  `support/alert-permissions.ts` were both free.
- Siblings read and reused **read-only**, nothing edited: `tests/alert.spec.ts`,
  `support/alert.ts`, `tests/email-alert.spec.ts`, `support/email-alert.ts`.
- No shared support module was modified. `PORTED.txt` / `QUEUE.md` /
  `playwright.config.ts` untouched. Nothing committed. Port 4000 never touched.

## Gate mapping + gate-OFF control

Upstream gate: `describe("scenarios > alert > alert permissions", { tags: "@external" })`
— file-level, no `beforeEach` tag, and (checked, not assumed) **no `afterEach`
anywhere in the source**, so a `beforeEach`-level `test.skip` is safe here; the
describe-level rule does not apply.

The tag is **genuine and needed by every test**: the shared `before()` calls
`H.setupSMTP()`, and `PUT /api/email` live-connects before saving, so without
maildev all three alerts fail to be created and every test collapses.

| control | result |
|---|---|
| gate ON (maildev up) | **7 executed, 7 passed** |
| gate OFF (`maildevUp = false`) | **7 skipped, 0 executed** |

Both arms measured, not inferred.

## Did the external services actually engage?

- **maildev — YES, mechanism probed directly.** The shared inbox is contaminated
  by concurrent slots (count went 5 → 4 across my run, because `setupSMTP`
  DELETEs the *shared* inbox and other agents were delivering into it), so the
  count delta is **not** a usable signal here. I probed the mechanism instead,
  against my own slot: `PUT /api/email` with `email-smtp-port: 1026` (dead) →
  **400 `{"email-smtp-host":"Wrong host or port"}`**; with `1025` (live) →
  **200**. So the setup genuinely crosses the process boundary. SMTP was left
  pointing at the live port.
  - Worth flagging for the next agent: `setupSMTP` clearing a **shared** inbox is
    a real cross-slot hazard for any concurrent spec that reads delivered mail.
    Pre-existing in the shared helper (the email-alert sibling does the same);
    not mine to fix, recorded only.
  - No test in this file *reads* a delivered message, so mail **delivery** is not
    a dependency — only the live connect is.
- **webhook-tester — NO.** Request-count delta on
  `:9080/api/session/<id>/requests`: **1 before, 1 after** a full 7-test run.
  Nothing here creates an HTTP channel. Consistent with the sibling's finding,
  and re-measured for this spec rather than inherited.

## Fixture ids — every one read from the fixture, none guessed

All read from `e2e/support/cypress_sample_instance_data.json` **at import time**:

| constant | value | read from |
|---|---|---|
| `ORDERS_QUESTION_ID` | **94** | `support/sample-data.ts` (`findByName(questions, "Orders")`) |
| `ORDERS_COUNT_QUESTION_ID` | **95** | `support/question-management.ts` (`findQuestionId("Orders, Count")`), imported read-only |
| `ORDERS_BY_YEAR_QUESTION_ID` | **96** | `support/sample-data.ts` (`findByName(questions, "Orders, Count, Grouped by Created At (year)")`) |

Confirms the brief's warning: `ORDERS_QUESTION_ID` really is **94**, not 1.

User full names come from the same table Cypress uses, via
`getFullName(ALL_USERS.admin | .normal)` in `support/admin-people.ts`:
admin = "Bobby Tables", normal = "Robert Tableton". No literal names in the spec.

No `USER_GROUPS` id is used anywhere in this spec.

## Sign-in: `signInWithCredentials` NOT used — and proven

Neither the tests nor the setup harness ever POSTs `/api/session`, so the
cookie-jar poisoning hazard is **inapplicable by mechanism**, not by absence:

- `mb.signIn` takes the cached-session branch. I verified `LOGIN_CACHE` in
  `cypress_sample_instance_data.json` contains **both** `admin` and `normal`, so
  the `/api/session` fallback in `fixtures.ts` is never reached.
- `createSetupHarness` (the `before()` harness) deliberately **throws** rather
  than falling back to credentials, so the hazard cannot creep back in.
- Belt and braces, and **not upstream**: the "should let you see all created
  alerts" test asserts `GET /api/user/current` → `admin@metabase.test` before
  reading `/api/notification`. Without it that test is silently vacuous under a
  wrong session (a non-admin just sees fewer alerts — no error).

## Absence assertions and their positive anchors

There are exactly two.

1. **`H.popover().findByText("Edit alerts").should("not.exist")`** (the
   permission-denial test) — this is precisely the pre-render shape the brief
   warns about. **Anchor added (not upstream):** the popover's
   `"Create an alert"` item must be visible *before* the absence is read.
   Upstream's order is absence-then-presence, which is satisfiable by an
   un-rendered popover on the first poll. Upstream's own presence assertion is
   still kept afterwards, verbatim. **Strengthening on a security surface,
   stated explicitly.**
   - Evidence it discriminates: killed by **two independent** mutations (M1 and
     M5, below).
2. **`cy.findByText("New alert").should("not.exist")`** inside `createBasicAlert`
   — **anchored on the `POST /api/notification` response**, i.e. proof the save
   actually happened, before the absence is read.

## Token

**INAPPLICABLE, traced not assumed.** There is no `activateToken` in the source,
and the predicate behind every assertion here is
`canEdit = isAdmin || (canManageSubscriptions && isCreatedByCurrentUser(alert))`
(`AlertListModal.tsx`) — plain OSS, no premium-feature check. This spec activates
no token, so no restore-and-gate-ahead dance was needed.

**Slot end state verified:** `GET /api/session/properties` on :4102 →
**0 enabled token-features, token-status absent**. Expected count for a spec that
activates none. No token values printed anywhere.

## Snowplow

**INAPPLICABLE, checked for this spec rather than inherited.** The source has zero
snowplow call sites, and `grep -rn "trackSimpleEvent\|trackSchemaEvent\|trackEvent"
frontend/src/metabase/notifications/` returns **nothing**. Neither vantage —
browser boundary for FE events, per-slot collector for BE events — has anything
to observe.

## Port decisions worth recording

- **`before()` not `beforeEach()`**, per the upstream comment. Ported as
  `test.beforeAll`, which needs its own browser context because `page`/`mb` are
  test-scoped; `browser` and the custom `workerBackend` fixture are worker-scoped
  and available there. `createSetupHarness` builds page + API client + cookie
  sign-in the same way `MetabaseHarness` does.
  - **Measured, because I initially got this wrong in my head:** under
    `--repeat-each=3` Playwright dispatches each repeat as a **separate worker**
    (log shows `worker 0`, `worker 1`, `worker 2`), so `beforeAll` re-runs per
    repeat and module-level state resets. Proof it re-runs and does real work:
    the "recipient" test passes in repeats 2 and 3 even though repeat 1's
    unsubscribe test removed `normal` from that alert. A module-level
    `setupDone` flag would also have been safe, but only by accident.
- **Upstream's "Make sure that all tests are always able to run independently!"
  comment is aspirational and false as written.** The unsubscribe test removes
  `normal` from the ORDERS_COUNT alert, which is exactly the precondition of
  "should let you see other alerts where you are a recipient". Cypress's
  declaration order puts the reader first and Playwright's does too
  (`fullyParallel: false`, `workers: 1`). **Recorded, not "fixed"** — reordering
  or adding a per-test restore would change what the suite covers.
- **`cy.findByText(..., { exact: false })` on the creator line.** Both Playwright
  `getByText` forms are wrong here in opposite directions (exact = full
  `textContent` so it matches ancestors; non-exact = case-insensitive substring
  over full `textContent`, same ancestor problem plus strict-mode violations on
  `Created by …`). Ported with a local `directTextContaining` xpath matcher
  restricted to **direct child text nodes** — the faithful analogue of
  testing-library's `getNodeText`. Case-insensitivity is irrelevant for these
  strings (asserted with the casing they render with).
- **`cy.findByText(x)` with no chained assertion** = exists AND is unique →
  ported as `toHaveCount(1)`, not `toBeVisible()` (which would weaken uniqueness
  and strengthen visibility at the same time).
- **`realHover()` before the unsubscribe icon is load-bearing, not decorative:**
  `.actionButtonContainer` is `display: none` until the list item is hovered
  (`AlertListItem.module.css`), and Playwright evaluates visibility *before* it
  hovers as part of a click. Reproduced explicitly with `.hover()`.
- **Two modals never coexist:** `QuestionAlertListModal` swaps `list-modal` →
  `unsubscribe-confirm-modal`, so `modal(page)` stays unambiguous. Checked in the
  component rather than assumed, since `modal()` matches *all* open dialogs.
- **`cy.findByText("Done")` → `getByRole("button", …)`** and
  **`.closest('[data-testid="channel-block"]')` → `filter({ hasText })`**: both
  forced, both because the literal text form strict-mode-violates
  (`ChannelSettingsBlock` nests the label `<Text>` inside a `<Group>` with the
  same full `textContent`).
- `cy.button(name)` is `findByRole("button", { name })` with exact accessible-name
  matching (verified in `e2e/support/commands/ui/button.ts`) →
  `getByRole("button", { name, exact: true })`.

## Mutation testing

**Verifier sanity-checked BEFORE use** (`scratchpad/s2-alert-perms-mutate.js`),
6/6 checks passed: aborts with **md5 unchanged** on 0 occurrences, on ambiguity
(2 occurrences), on a no-op (`old === new`), and on a missing file; mutates on a
unique anchor; and its `--restore` check fails loudly on an md5 mismatch and
passes on a match. Every mutation below printed `before=`/`after=` md5s and every
restore printed `RESTORED-OK`.

| # | mutation (input inverted) | predicted | observed | verdict |
|---|---|---|---|---|
| **M1** | **Remove the restriction:** grant `normal` `is_superuser: true` before the tests | tests 3, 6 die | **3 ✘, 6 ✘** (5 passed) | **KILLED — the decisive one** |
| **M5** | **2nd independent restriction proxy:** make `normal` a *recipient* of the ORDERS_QUESTION alert | test 3 dies | **3 ✘** | **KILLED** |
| M2 | drop `{ includeNormal: true }` from the ORDERS_COUNT alert | tests 4, 6 die | **4 ✘, 6 ✘** | KILLED |
| M3 | admin edit picks `daily` instead of `weekly` | test 2 dies at the **cron assertion** | 2 ✘ but at **30s timeout on the action** | **KILLED, but my bad mutation** — see below |
| M3b | admin edit picks `monthly` | test 2 dies at cron assertion | **2 ✘ in 1.1s**, `Expected "0 0 8 ? * 2 *" / Received "0 0 8 1 * ? *"` | KILLED at the tail |
| M3c | normal-user edit picks `monthly` | test 7 dies at cron assertion | **7 ✘ in 1.1s**, same diff | KILLED at the tail |
| M4 | create the third alert as `admin` instead of `normal` | tests 5, 7 die | **5 ✘, 7 ✘** (5 passed) | KILLED |

**No survivors.**

**Calling out my own bad mutation (M3):** I aimed it at the cron-assertion tail
and it died 30s earlier, at the `"Save changes"` click. I probed the hypothesis
rather than guessing: `daily` is the alert's **default** frequency, so
`hasChanges` never flipped and `CreateOrEditQuestionAlertModal`'s submit label
stayed `"Done"` (`submitButtonLabel` match in that component) — the button I was
clicking never existed. Re-aimed with `monthly` (M3b/M3c), which is a real change,
and both then died **at the cron assertion in 1.1s** rather than on a timeout.
The runtime was the tell, exactly as the brief predicts.

**Where mutants died** — the kills spread across all three layers, not bunched at
setup: M1/M5 at the permission-denial assertions, M2/M4 at the modal-open action,
M3b/M3c at the response-body cron assertion.

**Restores byte-identical:** every mutation was reverted through the verifier's
`--restore` md5 gate. After the mutation campaign, both files were confirmed at
their pre-mutation md5s (`a552b2b0…` / `6bc5e638…`). The files were *then*
formatted with prettier and one dead export removed, so the shipped md5s are
`94abc6d305ad0363feda951c1a99411c` (spec) and
`305ec5650c0baf941277ab9f19fafe14` (support) — a deliberate final edit, not
mutation residue.

## tsc, lint, dead-import audit

- `bunx tsc --noEmit` → **clean**.
- **Hand-audited every import** (tsc is provably silent on dead ones): all 16
  spec imports and all 8 support imports have real use sites. One genuinely dead
  export (`currentUser` on the setup harness) was found this way and removed —
  tsc had said nothing about it.
- `bunx prettier --check` → clean for both files. Note the siblings
  (`tests/alert.spec.ts`, `tests/email-alert.spec.ts`, `support/email-alert.ts`)
  do **not** pass prettier, so it is not an enforced gate in this directory; mine
  are formatted anyway.

## Runs

- `--workers=1`: **7 passed** (14.0s).
- `--repeat-each=3`: **21 passed** (41.0s), three separate workers.
- Gate-OFF control: **7 skipped**.

## Fixmes / open items

- The harness runs **1280×720**, not the configured 800 (known, fix owed
  elsewhere). Nothing in this spec is layout-dependent, so no failure was
  attributed to it.
- `createSetupHarness` duplicates ~20 lines of `MetabaseHarness`'s cookie
  sign-in. It exists only because `page`/`mb` are test-scoped and this spec needs
  a `before()`-shaped hook. **Candidate for consolidation:** exporting a
  worker-scoped harness factory from `support/fixtures.ts` would let this and any
  future `before()`-hook port drop the copy. Not done here — shared modules are
  off-limits to porting agents.
- Cross-slot hazard noted above: `setupSMTP` clears the **shared** maildev inbox.
- **Standing rule observed:** no Cypress cross-check was run, so I cannot say
  whether upstream also passes/fails any of this.

## Unexplained

Nothing. Every failure I saw during the port was an intended mutation, and each
one's death site was explained (including M3's, which I initially mis-aimed and
then probed rather than rationalised). No symptom was attributed to port drift
without a mechanism.

## Summary (3 lines)

Ported 7 tests 1:1 with no drops, merges or weakenings; the only strengthenings
are a positive anchor on the permission-denial absence check and a
`GET /api/user/current` identity assertion, both on security surfaces and both
declared. maildev genuinely engages (dead-port probe: 400 vs 200); webhook-tester
does not (request delta 1→1); token and snowplow are inapplicable by mechanism,
and the slot ends at 0 token-features.
Seven mutations, **zero survivors** — including the decisive
remove-the-restriction one and a second independent proxy for it; verifier
sanity-checked first, all restores md5-verified, tsc and prettier clean.
