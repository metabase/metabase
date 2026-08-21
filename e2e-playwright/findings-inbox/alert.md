# alert.cy.spec.js → tests/alert.spec.ts (slot 4, port 4104)

Source: `e2e/test/scenarios/sharing/alert/alert.cy.spec.js` (250 lines, 8 tests)
Target: `e2e-playwright/tests/alert.spec.ts`
Support module: **`support/alert.ts`** — the expected name, no deviation to flag.

## Collision checks

- `grep -rl "sharing/alert/alert\|tests/alert" tests/ support/` → **no hits**. No existing
  port of my source; nothing to stop for.
- `tests/alert.spec.ts` and `support/alert.ts` did not exist. `alert-types`,
  `alert-permissions`, `email-alert` are not ported (still queue-only).
- `tests/subscriptions.spec.ts` + `support/subscriptions.ts` **do** exist (port of
  `sharing/subscriptions.cy.spec.js` — a different source). Read, not collided with;
  `support/subscriptions.ts` was reused only as a *reference* for the TokenField typing
  shape, not imported.
- `tests/metric-page.spec.ts` contains a near-identical webhook-alert test from
  `metrics/metric-page.cy.spec.ts`. Different source spec; not a collision.
- No shared support module was edited. PORTED.txt / QUEUE.md / playwright.config.ts
  untouched. Nothing committed. Port 4000 never contacted.

## Jar verified by identity

`unzip -p target/uberjar/metabase.jar version.properties` → `hash=751c2a9`, matching
COMMIT-ID `751c2a98`. The four running JVMs are `java -jar .../target/uberjar/metabase.jar`;
slot 4's is PID 14266 holding :4104. Verified by identity, not by `JAR_PATH`.

## Did maildev and webhook-tester actually engage?

**I probed both rather than assuming, and the two answers differ.**

- Containers up: `maildev/maildev:2.2.1` (:1025/:1080) and
  `tarampampam/webhook-tester:1.1.0` (:9080). **`maildev-ssl` is absent** — no container,
  and :1081 returns nothing. **Inapplicable to this spec**: I checked the mechanism, not
  just the symptom — `setupSMTP` sends `"email-smtp-security": "none"` against :1025, so no
  test here wants an SSL SMTP endpoint.

- **maildev: YES, genuinely engaged.** `PUT /api/email` live-connects before saving
  (`metabase.channel.email/check-and-update-settings` → `test-smtp-connection`,
  email.clj:379). Measured directly against :4104:
  - dead port 1026 → `400 {"errors":{"email-smtp-host":"Wrong host or port", ...}}`
  - live port 1025 → `200`
  So the EE describe and the dashboard-question test really do open an SMTP connection.
  No mail is *sent* (inbox stayed at 0 messages) — engagement is at the handshake level only.

- **webhook-tester: NO — never contacted. The `@external` tag on that describe is
  over-broad.** Two independent lines of evidence:
  1. Code: `POST /api/channel` only inserts the row
     (`src/metabase/channel/api/channel.clj:51`); it never calls `channel/can-connect?`.
     That lives in the separate `POST /api/channel/test`. And the alert is created and
     then deleted without ever firing.
  2. Measurement: the container's recorded-request count was **1 before and 1 after**
     every run in this session — including `--repeat-each=3`, i.e. 4 more executions of
     the webhook test. Zero delta.

  I kept the gate anyway (mirrors upstream's declared requirement) and documented it in
  the spec header. Flagging rather than silently dropping it.

## Gate mapping, with the gate-OFF control

| upstream | upstream tag | what the code actually needs | verdict |
|---|---|---|---|
| `describe("with nothing set")` (2 tests) | none | nothing | correct |
| `describe("with a webhook")` | `@external` | nothing external (see above) | **over-broad** |
| `it("should not be offered for models")` | none | nothing | correct |
| `it("can set up an alert … saved in a dashboard")` | **none** | maildev (`setupSMTP` live-connects) | **MISSING** |
| `describe("approved domains (EE)")` | `@external` | maildev **+ pro-self-hosted token** | correct but **incomplete** (token requirement is not expressed as a tag) |

I read every `beforeEach`. Two real defects: a missing tag on the dashboard-question test,
and an over-broad one on the webhook describe.

**Gate-OFF control (the only trustworthy signal), executed:** forcing `maildevUp = false`,
`webhookTesterUp = false` and `hasToken = false`:

```
✓ should prompt you to add email/slack credentials
✓ should say to non-admins that admin must add email credentials
- should be able to create and delete alerts with webhooks enabled
✓ should not be offered for models (metabase#37893)
- can set up an alert for a question saved in a dashboard
- should validate approved email domains for a question alert
- should validate approved email domains for a dashboard subscription
- should not display the list of approved domains for non-admins
5 skipped, 3 passed
```

Gate-ON: 8 executed, 8 passed. So executed-vs-skipped is exactly the intended partition,
and the skips report as **skipped, not failed** — no describe here has an `afterEach`, so
the `beforeEach`-level `test.skip` form is safe (I checked the mechanism the warning names).

## Token: predicate, both arms, and restoration

`H.activateToken("pro-self-hosted")` is **load-bearing at two hard
`define-premium-feature` points**, both `:feature :email-allow-list` — this is the "hard
`define-premium-feature`" outcome, not a red herring:

1. `defsetting subscription-allowed-domains` (`advanced_config/settings.clj:16`) — the
   *setter* is feature-gated, so the beforeEach's `setAllowedDomains()` fails outright.
2. `defenterprise validate-email-domains!`
   (`advanced_config/models/notification.clj:17`) — the OSS fallback
   (`src/metabase/notification/models.clj:378`) returns `nil`, so the 403 that test 3
   asserts on never happens.

**BE/FE do not disagree, but they are asymmetric in a way that is the whole point of test 3:**
the FE has *no* token check — `RecipientPicker` / `notifications/utils.ts` just read the
setting value. The setting is `:visibility :settings-manager`, so a normal user never
receives it, FE validation passes, "Done" stays enabled, and the backend 403 surfaces as
the error toast. Notably `email-allow-list` is absent from the FE `token-features` map in
*both* arms — the frontend never learns about this feature at all.

**Both arms run** against :4104:

| arm | features ON | `PUT /api/setting/subscription-allowed-domains` |
|---|---|---|
| `starter` | 4 | **500** — "Setting subscription-allowed-domains is not enabled because feature :email-allow-list is not available" |
| `pro-self-hosted` | 42 | **204** |

So the gate is real and hard: without the token the EE describe cannot even reach its
assertions.

**Token restored.** I activated `starter` to probe, then `pro-self-hosted`. After all runs
I restored the default snapshot and cleared `premium-embedding-token` on slot 4:
`features ON: 42 → 0`. No token values printed anywhere.

## Snowplow vantage

**Inapplicable — and I checked the mechanism rather than just noting an absent tag:**

- 0 snowplow references in the source spec (no `@snowplow` tag, no `expectGoodSnowplowEvent`).
- 0 snowplow emission anywhere under `src/metabase/notification/` or
  `enterprise/backend/src/metabase_enterprise/advanced_config/`.
- 0 `trackSimpleEvent` / `trackSchemaEvent` call sites under
  `frontend/src/metabase/notifications/`.

The alert flow emits no analytics events on either side, so neither the FE-vs-backend
vantage question, the collector's CORS blindness, nor the queued-offset "hollow green"
applies. **I did not need and did not use a fresh backend** — stating that plainly rather
than claiming a precaution I didn't take.

## Assertion-trap handling

- `cy.findByText(x)` ported as **`toHaveCount(1)`**, not `toBeVisible()` — testing-library's
  `findByText` is an existence assertion that also throws on multiple matches, and
  `toBeVisible()` would have silently strengthened it. Where upstream chained an explicit
  `.should("be.visible")`, that is ported too.
- `.closest("a")` → `getByRole("link", {name})`. A `getByText(..., {exact:true})` would
  **strict-mode-violate** here: Playwright reads full `textContent`, so the Mantine
  `Button-label` span *and* its `Button-inner` wrapper both match.
- **Measured trap, cost me run 1:** for the `not.exist` checks I first used bare
  `getByText("Set up email")`, reasoning it was "deliberately broader". Playwright's
  non-exact matching is **case-INSENSITIVE**, so it matched the paragraph this same modal
  is asserted to contain ("…ask your admin to **set up email**, Slack, or a webhook."):
  expected 0, received 1. Now asserted two ways — `getByRole("link")` count 0 **and**
  `getByText(name, {exact:true})` count 0.
- The trash button sits in `.actionButtonContainer { display: none }`, shown only on list-item
  `:hover` (AlertListItem.module.css). Playwright's visibility check runs **before** the
  click's own hover, so upstream's `realHover()` is reproduced with an explicit `.hover()`
  and is **required, not decorative**.
- Toast lingering (`UndoListing.tsx:203` — exit transitions disabled only under Cypress):
  the two toasts in EE test 3 are separated by a full `visitDashboard` navigation, which
  tears the toast list down, so the trap cannot apply. Asserted with `toHaveCount(1)`, not
  loosened to `.first()`. In the webhook test the two toasts carry distinct strings.
- `should("exist")` on `cy.icon("download")` ported as `not.toHaveCount(0)` — Cypress
  tolerates multiple matches there, so `toHaveCount(1)` would have been a silent strengthening.
- `addEmailRecipient` sends **no `{enter}`** upstream; the token commits on blur
  (`TokenField.onInputBlur`). Blur is applied to the live `document.activeElement`, because
  `RecipientPicker` drops its placeholder the moment `recipients.length > 0` and a
  pre-captured locator can stop resolving mid-blur. This is the recipient-picker /
  `PillsInput` submit-trap shape; the "Done is disabled" assertions only mean anything
  once focus has left.
- No `cy.wait("@alias")` anywhere in the source — nothing to check for past-response popping.
- No fixture ids guessed: `ORDERS_MODEL_ID` from `support/organization.ts`,
  `ORDERS_QUESTION_ID`/`ORDERS_DASHBOARD_ID`/`SAMPLE_DB_ID` from `support/sample-data.ts`.
  Upstream's `SAMPLE_DATABASE.id` does not exist on the Playwright JSON fixture (tsc caught
  it); replaced with `SAMPLE_DB_ID`, same value.
- `cy.setCookie("metabase.SEEN_ALERT_SPLASH", "true")` is **dead setup** — the name appears
  nowhere under `frontend/src`, only in e2e specs. Ported verbatim for faithfulness, annotated.
- Layout-dependent failures: none observed, so the 1280×720-vs-800 harness discrepancy did
  not need to be invoked. No snapshots regenerated. `blank.sql` not touched.

## Mutation testing

Verifier sanity-checked **before** use: aborts on count==0, on ambiguity (count==35), and on
a no-op replacement — with the file's md5 unchanged after all three. Anchored replace with
`count == 1`, file read back each time.

**My verifier had a real flaw and I'm calling it out**: it wrote before validating, and its
"anchor absent after replace" check false-fired on wrapping mutants whose replacement embeds
the anchor. It aborted *after* writing twice (M2, and the presence probe). Neither run was
compromised — the mutation was in fact applied and the run exercised it — but the reporting
was wrong. Patched to validate `read-back == written`, and to skip the anchor-absence check
when `anchor in repl`; re-sanity-checked afterwards.

| # | mutation (input inverted) | result | died where |
|---|---|---|---|
| M1 | add "Foo Hook" instead of "Bar Hook" | **bad mutation** | died in the *helper* at the channel-picker click, not an assertion — "Foo Hook" is already the default handler when email is unconfigured, so it isn't offered under "Add another destination". Discarded, redesigned as M1b. |
| M1b | delete the explicit `addNotificationHandlerChannel(page, "Bar Hook")` | **SURVIVED** | — |
| M2 | break delivery: `POST /api/notification` → 500, **empty body** | killed | line 226, `"Your alert is all set up."` toast (expected 1, received 0) |
| M3 | break delivery: `PUT /api/notification/*` → 500, empty body | killed | line 253, `"The alert was successfully deleted."` toast |
| M5 | allow the *denied* domain (backend stops rejecting) | killed ×3 | 358 (admin error text), 378 (`Send email now` enabled), 410 (toast `color` attr) — a distinct tail per test |
| M6 | visit the question instead of the model | killed | line 268, the `sharingMenuButton` `not.exist` tail |

M2/M3 are the delivery-breaking probes the brief asks for, and they died at the **read-side**
assertions, not merely at a success toast.

**The M1b survivor, resolved by presence probe.** I added temporary assertions for
`/Bar Hook/` and `/Foo Hook/` in the Edit-alerts modal: both render, exactly once each. So
the data **can** discriminate — this is a genuine assertion gap, not a data limitation. The
alert already carries "Foo Hook" as a default handler, so `cy.icon("webhook")` is satisfied
whether or not the explicit channel-add happened, and upstream never asserts *which* hook
the alert targets. **Recorded, not strengthened** (weak-but-faithful stays faithful).

**Restored byte-identical**: `md5 5583dd647eb35b97b8822a1db70bce04`, `diff` against the
pristine backup empty, and a post-restore full run is 8/8 green.

## Fixmes / owed work (not applied here)

1. **Missing tag** — `it("can set up an alert for a question saved in a dashboard")` needs
   `{ tags: "@external" }` upstream; it calls `H.setupSMTP()`, which live-connects.
2. **Over-broad tag** — `describe("with a webhook", { tags: ["@external"] })` needs nothing
   external; measured zero requests to the container.
3. **Assertion gap** — the webhook test should assert the alert targets *Bar Hook*
   specifically (the name is rendered and available); today the explicit channel-add is
   unverified (M1b survivor).
4. **EE describe** has no token tag despite a hard `:email-allow-list` gate.
5. Shared, already-owed and **not applied by me**: the snowplow collector's missing
   `Access-Control-Allow-Credentials`; the 1280×720-vs-800 harness viewport.

## Verification

- Run 1: 7/8 (the case-insensitive `getByText` failure above — my own error, fixed).
- Run 2: **8/8**.
- `--repeat-each=3`: **24/24** green, 1.1m.
- Gate-OFF control: 3 passed / 5 skipped.
- Post-mutation restore run: **8/8**.
- `bunx tsc --noEmit`: **clean** (it did catch the `SAMPLE_DATABASE.id` error; the "tsc is
  silent" caveat is specifically about dead imports, which I hand-audited separately — all
  25 imports in the spec and all 6 in `support/alert.ts` have real code uses).

## Instance state restored

The EE describe mutates instance-wide settings. After all runs I restored the default
snapshot and cleared the token on :4104, verified by reading back:

```
BEFORE cleanup: features ON=42  email-configured=True   allowed-domains=metabase.test
AFTER  cleanup: features ON=0   email-configured=False  allowed-domains=None
```

Stability across consecutive runs was confirmed by `--repeat-each=3` (three consecutive
full passes) plus two further standalone green runs.

## Unexplained

Nothing left unexplained. One imprecision worth recording rather than papering over: in M5,
EE test 3 died at line 410 with "element(s) not found" on the `color` attribute even though
line 409's `toHaveCount(1)` had passed — the success toast auto-dismissed between the two
assertions. The mutant died where I aimed (the toast-colour tail), but the specific error
text reflects a dismissal race, not a missing toast.

## Summary

Ported 8/8 faithfully; green single, `--repeat-each=3` (24/24), and post-mutation; tsc clean.
The load-bearing findings are that the token gate is **hard and real** (both arms measured:
`starter` → 500 on the setter, `pro-self-hosted` → 204) while the `@external` tags are wrong
in two directions — **maildev genuinely engages** (dead-port 400 vs live-port 200 proves the
live SMTP validation) but **webhook-tester is never contacted** (0 request delta across every
run), and the untagged dashboard-question test needs maildev.
Five mutants killed at their intended tails and one survived: the explicit webhook
channel-add is unverified because a default handler already satisfies the icon assertion —
confirmed as an assertion gap, not a data limitation, by presence probe.
