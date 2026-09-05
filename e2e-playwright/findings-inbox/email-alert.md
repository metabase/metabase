# email-alert.cy.spec.js → tests/email-alert.spec.ts (slot 2, :4102)

Source: `e2e/test/scenarios/sharing/alert/email-alert.cy.spec.js` (245 lines, 9 tests)
Target: `e2e-playwright/tests/email-alert.spec.ts`
Support module: **`support/email-alert.ts`** — matches the expected name.

## Collision checks

- `grep -rl "email-alert" tests/ support/` → **no hits** before my write. No
  existing port of my source. Nothing to STOP on.
- `support/alert.ts` and `tests/alert.spec.ts` (sibling, in progress) — **not
  touched, not imported**. My module reuses `add/removeNotificationHandlerChannel`
  from `support/question-saved.ts` and `setupNotificationChannel` from
  `support/metric-page.ts`, which are the same helpers the sibling imports —
  those are pre-existing files neither of us wrote this session.
- No shared support module edited. `support/INDEX.md` **deliberately not
  regenerated** (shared generated file, concurrent agents) — orchestrator should
  run `node scripts/build-helper-index.mjs` at the consolidation pass.

## Jar identity (by identity, not JAR_PATH)

`lsof :4102` → java PID 24760, argv `-jar /Users/fraser/.../target/uberjar/metabase.jar`.
`/api/session/properties` → `version.hash = 751c2a9`, matching
`target/uberjar/COMMIT-ID = 751c2a98`. Tag is `vUNKNOWN` (relevant below).

## Did maildev / webhook-tester actually engage?

Probed, not assumed:

- **maildev 2.2.1 — UP and GENUINELY ENGAGED.** `:1080/email` → 200 `[]`,
  `nc :1025` → open. Engagement is not merely "setupSMTP didn't throw": mutation
  **M3** (below) repointed `email-smtp-port` at dead port 1026 and **all three
  branding tests went red**, because they navigate the browser to
  `http://localhost:1080/email/<id>/html` and assert on the message maildev
  actually received. Real cross-process delivery, not a toast.
- **webhook-tester (:9080) — UP but NOT ENGAGED by this spec.** The 12349 test
  calls `H.setupNotificationChannel({ name: "Webhook" })`, which POSTs
  `/api/channel` pointed at `127.0.0.1:9080`. Read the endpoint
  (`src/metabase/channel/api/channel.clj`, `defendpoint :post "/"`): it does a
  name-uniqueness check and `t2/insert-returning-instance!` — **no connection
  test** (that is the separate `POST /api/channel/test`). The alert the test then
  saves is a **Slack** handler and is never fired. So nothing here crosses to
  :9080. Same conclusion the `alert.cy.spec.js` sibling reached, arrived at
  independently.
- **Slack is MOCKED** (`mockSlackConfigured` stubs `/api/pulse/form_input`) — no
  Slack container or credentials involved.
- maildev-ssl (down) and localstack (down) are **inapplicable** — this spec
  never uses SSL SMTP or S3.

## Gate mapping, with the gate-OFF control

| Upstream tag | Verdict | Port |
|---|---|---|
| `describe(..., {tags:"@external"})` | **Correct and needed by every test** — the shared `beforeEach` calls `H.setupSMTP()`, and `PUT /api/email` live-connects (`check-and-update-settings → test-smtp-connection`) before saving | describe-scoped `test.skip(!maildevUp)` from an `isMaildevRunning()` probe in `beforeAll` |
| ...but **over-broad about which container** | `@external` reads as "needs the container set"; only **maildev** is needed. webhook-tester is named in the code and never contacted (see above) | documented, gate kept on maildev only |
| `it(..., {tags:"@OSS"})` on the first branding test | **RED HERRING** — see next section | ported **ungated** |
| (none) on the Starter / Pro branding tests | correct — they self-gate by activating their own token | as-is |

**Gate-OFF control (executed, both directions):**

- Gate ON (maildev up): **9 passed** (`scratchpad/s2-email-alert-run1.log`).
- Gate OFF (forced `maildevUp = false`, single anchored edit, reverted):
  **9 skipped, 0 failed** (`scratchpad/s2-email-alert-gateoff.log`).

The "`beforeEach`-form skip reports *failed* when the describe has an
`afterEach`" warning is **inapplicable here**: this describe has an `afterAll`,
not an `afterEach`, and the control run proves it — all 9 report `-` (skipped),
none failed. Checked the mechanism rather than assuming.

## Token: predicate, arms run, slot end state

**Predicate traced to source.** `src/metabase/notification/payload/core.clj:137`:

```clj
:include_branding (not (premium-features/enable-whitelabeling?))
```

consumed by `{{#if context.include_branding}}` in
`src/metabase/channel/email/notification_card.hbs:7`.

That is a **pure `:whitelabel` token-feature check**. There is **no build check**
and **no `is-hosted?` short-circuit** — so this is not the "split by argument",
"BE/FE disagree", or "gates nothing" shape. It is a straight feature gate.

**Both arms run, and both are in the spec itself:**

| Arm | Token | Expectation | Result |
|---|---|---|---|
| OFF | none (post-`restore`, EE jar) | branding SHOWN | test 7 passes |
| OFF | `starter` (no `:whitelabel`) | branding SHOWN | test 8 passes |
| ON | `pro-self-hosted` (`:whitelabel`) | branding HIDDEN | test 9 passes |

Cross-checked by mutation (M1/M2 below) rather than by inspection: swapping the
arms flips both outcomes red at the right assertions, so this is **not** the
"removing `activateToken` changes nothing" red herring.

**Slot end state — verified, not assumed.** No foreign token was activated to
probe; the spec's own tokens are the probe. `test.afterAll` clears
`premium-embedding-token` explicitly (Cypress relies on the *next* spec's
restore, which on a long-lived kept slot backend leaves `pro-self-hosted`
live and would make a genuinely gated spec look ungated). After the final run:

```
token features ON: 0
email-configured?: false ; smtp-host: null ; smtp-port: null
report-timezone: null
version.hash: 751c2a9
```

No token values printed anywhere.

## How the `@OSS` test resolved, with the run that showed it

**Resolved as token-gated, NOT build-gated → ported UNGATED, and it is real
coverage on the EE jar.**

Reasoning + evidence:

1. "OSS instance" in this test means exactly "no `:whitelabel` feature". An EE
   jar with **no token** satisfies that predicate identically to an OSS build.
2. The brief's counter-case (`PLUGIN_IS_EE_BUILD` still renders EE chrome; any
   upsell-CTA `role=link` assertion is OSS-build-only) is **inapplicable**: the
   assertion is on the **rendered email served by maildev on :1080**, a document
   the Metabase FE bundle cannot influence at all.
3. Run that showed it: **run 1, test 7 `✓ should include branding for OSS
   instances (2.6s)`**, on the EE jar, with `token features ON: 0` confirmed
   against the same backend immediately after.
4. Had I applied `isOssBackend()` reflexively it would have **permanently
   skipped**: this backend reports `version.tag = vUNKNOWN`, and `isOssBackend`
   errs to "not OSS" on an unresolved tag. One would-be skip converted into real
   coverage.

## Snowplow vantage

**INAPPLICABLE — no vantage used, and that is the finding.** The source spec has
zero snowplow call sites (no `resetSnowplow`, `expectGoodSnowplowEvent`,
`enableTracking`, no `@snowplow` tag). There is nothing to observe, so neither
the browser boundary (FE events) nor the per-slot collector (backend events) is
wired in. Consequently the two live hazards — the collector being blind to FE
events (missing `Access-Control-Allow-Credentials`), and backend events being
queued behind a persistent offset — **cannot affect this spec**. I did not need
a fresh backend for event-offset reasons (I did note the slot backend was
`(reused)`; irrelevant here).

## Mutation testing

**Verifier sanity-checked BEFORE use** (`scratchpad/s2-email-alert-mutate.mjs`):
anchored replace that aborts on 0 occurrences, aborts on >1, aborts if md5 is
unchanged after the write, and re-reads the file to confirm the replacement text
landed. Self-tested against a 3-occurrence anchor (`ABORT: anchor found 3 times`)
and an absent anchor (`ABORT: anchor not found`), with the file byte-unchanged
after both. Every mutation below reports `OK: 1 occurrence replaced` with a
before→after md5.

| # | Mutation (INPUT, not assertion) | Outcome | Where it died |
|---|---|---|---|
| M1 | Give the `@OSS` branding test `activateToken("pro-self-hosted")` | **KILLED** | test 7, `expectAlertBranding` → `toBeAttached()` "element(s) not found" (spec:389) |
| M2 | Remove `activateToken("pro-self-hosted")` from the Pro branding test | **KILLED** | test 9, `toHaveCount(0)` (spec:367) — branding reappeared |
| M3 | Break delivery: `updateSetting("email-smtp-port", 1026)` after `setupSMTP` | **KILLED ×3** | tests 7/8/9 all die on `waitForResponse` for `POST /api/notification/send` (30s timeout); tests 1–6 **survive correctly** |
| M4 | Make Slack "configured" (`mockSlackConfigured`) in the 48407 test | **SURVIVED — bad mutation, see below** | — |
| M4b | Presence probe: additionally `addNotificationHandlerChannel("Slack")` | **KILLED** | `directText(configuredChannel,"Slack")` `Expected: 0, Received: 1` (spec:180) |

Notes on where they died and what that buys:

- **M1/M2 aim at the tail** (the token predicate) and kill cleanly in opposite
  directions. Together they rule out the "flag is set but gates nothing" and
  "removing `activateToken` changes nothing" outcomes for this spec.
- **M3 is the delivery probe the brief asks for.** It matters that the three
  branding tests die and tests 1–6 do **not**: that is a clean map of which
  tests depend on an email actually reaching maildev. Note there is no success
  toast to be fooled by here — the tests read the delivered message itself.
  Runtime was also a tell (branding tests 31–37s vs 2.5–7.5s green).
- **M4 was my bad mutation and I am calling it out.** `mockSlackConfigured`
  stubs `/api/pulse/form_input`, which drives the *"Add another destination"*
  menu — not the **default handler list** that `alert-configured-channel`
  renders. So it never changed the input the 48407 assertion reads; the mutant
  survived because the mutation was wrong, not because the assertion was weak.
- **M4b settles it.** The presence probe makes the locator resolve to exactly 1
  element, so `directText(configuredChannel, "Slack") → toHaveCount(0)` is
  **non-vacuous and discriminating**. "Vacuous" is ruled out on evidence.

**Restored byte-identical after every mutation.** Final
`md5 tests/email-alert.spec.ts = 4433eb47028e502676a6b8b03e099095`, equal to the
pre-mutation baseline, and `diff` against the saved original is empty.

## Faithfulness notes (weak upstream assertions recorded, not strengthened)

- **12349 ends on a bare `.click()`** of "Delete this alert" with no follow-up.
  Nothing verifies the alert was actually deleted — the click *is* the whole
  assertion (that the button exists and is actionable, which is what #48402 was
  about). Ported verbatim; recorded as weak.
- **Branding assertions ported in their true upstream shape, not collapsed.**
  `.should("contain","Metabase")` is chai-jquery over a *collection* → ANY-OF;
  the chained `.and("have.attr","href",…)` reads jQuery `.attr()` → **FIRST**
  element. Two different quantifiers on one chain. Reproduced as
  `filter({hasText:/Metabase/}).first() → toBeAttached()` plus
  `brandingLinks.first() → toHaveAttribute(...)`.
- **`cy.findByText("Slack").should("not.exist")`** ported with a `directText()`
  XPath matcher, **not** `getByText(exact)` — testing-library's `getNodeText`
  reads only DIRECT CHILD text nodes while Playwright reads full `textContent`,
  and on an absence assertion the looser matcher makes the check harder to
  satisfy for the wrong reason. Applied to the `not.exist` direction, as
  required.
- **`:contains()` is case-SENSITIVE substring**; Playwright's
  `filter({hasText: string})` is case-INsensitive. Ported as a case-sensitive
  RegExp (`linksContaining`).
- **`cy.findByLabelText("Name").type(" alert")` APPENDS**; `fill()` would
  replace. Ported as click + `End` + `pressSequentially`.
- **`cy.intercept("POST","/api/notification")` is an EXACT-path matcher** —
  `/api/notification/send` (fired by the branding tests) was never aliased.
  Ported as `pathname === "/api/notification"`. Same for `/api/card`, which is
  why `/api/card/:id/query` is not counted by the 36866 assertion.
- **`cy.setCookie("metabase.SEEN_ALERT_SPLASH","true")` is DEAD SETUP** — the
  name appears nowhere under `frontend/src`. Ported verbatim.

## One deliberate strengthening — stated

In the 36866 test, upstream's final `cy.get("@saveCard.all").should("have.length",1)`
is a **retrying** Cypress assertion, so it keeps re-checking while the save is in
flight. Playwright's `expect(number).toBe(1)` is **one-shot** and would read the
counter before the FE had any chance to fire a second `POST /api/card` — i.e. a
literal port would be vacuous in exactly the "empty state renders pre-fetch" way.
I anchored it on the `PUT /api/notification/:id` response first. This is
**stronger than upstream** and is marked as such inline in the spec.

## Environment traps checked

- **1280×720 harness vs configured 800** — no layout-dependent assertion in this
  spec (all assertions are on API payloads, modal text, or the maildev-rendered
  email). Inapplicable.
- **`blank.sql` corrupt / snapshot 30-day fuse** — spec uses the `default`
  snapshot only; three consecutive full runs green, so the fuse has not blown on
  this box. No snapshot regenerated.
- **Instance-wide settings restored.** SMTP (`PUT /api/email`) and
  `report-timezone` are the only settings this spec writes, plus a `Webhook`
  channel row. `--repeat-each=3` (**27 passed**, three consecutive full runs) is
  the second-consecutive-run evidence that the spec is self-restoring via
  `mb.restore()`. Afterwards I explicitly issued `DELETE /api/email` (204) and
  re-read state: `email-configured?: false`, `report-timezone: null`,
  `token features ON: 0`.
- **Note correcting the brief:** under `PW_PER_WORKER_BACKEND=1` each slot has
  its **own** JVM and its **own** app DB (`MB_DB_FILE` under
  `$TMPDIR/mb-pw-slot-<N>`, `support/worker-backend.ts:266`). So "four slots
  share this instance" does **not** hold for instance-wide settings in this
  configuration — my SMTP/timezone writes were never visible to slots 1/3/4/5.
  Restored anyway.

## tsc

`bunx tsc --noEmit` from `e2e-playwright/`: **clean for my files**. The only
error in the whole run is a sibling agent's scratch spec
`tests/s3-ldap-probe5.spec.ts(7,23): TS7006` — not mine, not touched.

**Hand-audited both files for dead imports** (tsc is provably silent on them):
every import in `tests/email-alert.spec.ts` (20) and `support/email-alert.ts` (5)
has a live use. No dead imports.

## Not verified / out of scope

- **No Cypress cross-check was run** (standing rule) — I cannot say whether
  upstream passes or fails on this backend.
- The `directText` matcher is duplicated from
  `support/transforms-template-tags.ts` rather than imported, to avoid coupling
  to an unrelated spec module. Consolidation candidate.
- `PORTED.txt` / `QUEUE.md` / `playwright.config.ts` / `support/INDEX.md` not
  touched, per instructions.

## Fixmes

**None.** All 9 tests pass; no `test.fixme`, no product-bug claim.

## Summary

Ported 9/9 green on the CI EE uberjar (verified by identity, `751c2a9`), stable
at `--repeat-each=3` (27/27), tsc clean, no fixmes.
The `@OSS` tag is a red herring — the branding gate is a pure `:whitelabel`
token-feature check with no build check, so the test runs for real on the EE jar
and gating it with `isOssBackend()` would have skipped it permanently; the
`@external` tag is correct for maildev (proven engaged by breaking delivery) but
over-broad about webhook-tester, which `POST /api/channel` never contacts.
Four mutations run against a self-tested verifier: three killed (both token arms,
plus delivery), one survivor that the presence probe identified as **my** bad
mutation rather than a weak assertion; spec restored byte-identical and the slot
left at 0 token features with SMTP cleared.
