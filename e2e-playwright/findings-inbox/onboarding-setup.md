# onboarding-setup

Port of `e2e/test/scenarios/onboarding/setup/setup.cy.spec.ts` (795 lines)
-> `tests/onboarding-setup.spec.ts` + `support/onboarding-setup.ts`.

Slot 5 / port 4105. Jar `751c2a9` (`target/uberjar/metabase.jar`).

## Headline

**This box's `e2e/snapshots/blank.sql` is corrupt, and that alone fails all 15
tests.** With a known-good blank snapshot the port runs **14 passed / 1 fixme**,
stable over `--repeat-each=2` (28/28) and identical with the QA-DB gate off.

---

## 1. Collision checks

- Source dir `e2e/test/scenarios/onboarding/setup/` holds exactly two files:
  `setup.cy.spec.ts` (mine) and `user_settings.cy.spec.js`. **No same-basename
  `.js`/`.ts` pair.** `user_settings` is already ported as
  `tests/user-settings.spec.ts` — I did not touch it.
- `e2e/test-component/` contains only `scenarios/embedding-sdk/*.cy.spec.tsx`.
  No `setup.cy.spec.*` anywhere under it.
- `tests/` had **no** port of this source. `onboarding-sso`, `onboarding-about`,
  `onboarding-checklist`, `onboarding-notifications`, `onboarding-urls`,
  `signin`, `homepage` and the twelve `sdk-embed-setup-*` targets all come from
  unrelated sources.
- **Support module name does NOT deviate**: `support/onboarding-setup.ts`
  matches `tests/onboarding-setup.spec.ts`.

## 2. What I did with the two inherited files

Both were **adopted**, after diffing against the Cypress original. This was the
rare case where the inherited work was sound: it was faithful test-for-test and
assertion-for-assertion, and several of its comments encoded real, checkable
claims. I verified the load-bearing ones rather than trusting them:

| Inherited claim | Verdict |
| --- | --- |
| `restoreBlank` must bypass `mb.restore()` (the wrapper polls search with a non-existent admin session, then `PUT`s `/api/database/1` and throws on a blank instance) | **Confirmed** by reading `support/fixtures.ts` |
| Safe to skip the sample-DB re-point because the backend builds it in the slot-private dir | **Confirmed**: `worker-backend.ts:267` sets `MB_INTERNAL_DO_NOT_USE_SAMPLE_DB_DIR` |
| `expectSetupCardNotVisible` must not be `toBeHidden()` (fixed + `translateY(200%)`) | **Confirmed** against `SetupCardContainer.styled.tsx` |
| Viewport is 1280x800 | **Wrong** — `page.viewportSize()` measures **1280x720**. Corrected in the comment. Width (the breakpoint input) is 1280 either way, so the reasoning stands |
| `invite_sent` is backend-emitted | **Confirmed** (`src/metabase/users/util.clj:91`), and observed on the collector |
| "Embed Metabase in your app" absence check is vacuous | **Confirmed** — no such literal in `frontend/src`. Kept verbatim with the analysis inline, per the hard rule |

I found and fixed **one genuine drift** (§5), added a `fixme` for **one harness
bug** (§6), and corrected the viewport figure. Nothing was dropped or merged.
No `"ZZZ …"`-style planted constants, no identical-test drift.

Provenance predicted nothing here — I judged it on the evidence, and it happened
to hold up.

## 3. Setup/snapshot state required — and the blocker

Every test needs `H.restore("blank")`: an app DB with **no users and setup not
completed**, so `/setup` is reachable. This is the first port to use a
non-`default` snapshot.

**The harness mechanism works. The snapshot file on this box does not.**

`e2e/snapshot-creators/default.cy.snap.js:46` takes `snapshot("blank")` *before*
`setup()`, so a correct `blank.sql` has zero real users. Measured:

| file | users | cards |
| --- | --- | --- |
| `blank.sql` | **11** | **97** |
| `setup.sql` | 2 | 93 |
| `default.sql` | **11** | **97** |

`blank.sql` is the fully-set-up state — it matches `default.sql`, not a blank
instance. (`setup.sql` is correct, so this is not a wholesale snapshot problem.)
`e2e/snapshots/*` is **gitignored**, i.e. a locally generated artifact, so this
is a stale local file, not a repo defect; CI regenerates it.

Control, same backend, back to back — this is the gate-ON/gate-OFF pair:

```
POST /api/testing/restore/blank           -> 204, has-user-setup TRUE   (set up)
POST /api/testing/restore/pw-blank-verify -> 204, has-user-setup FALSE  (blank)
POST /api/testing/restore/nonsense        -> 404   (endpoint is live)
```

With the corrupt file all 15 tests fail identically at the welcome page, because
`/setup` redirects to an already-configured app. **That single cause accounted
for the entire 15-way failure** — 15 failed became 13 passed the moment a real
blank snapshot was supplied.

**I did not regenerate `blank.sql`.** Doing so means running the Cypress snapshot
pass, which is forbidden here and would rewrite files all five slots share.

Instead I captured a correct snapshot on **my own port only**: stopped the slot-5
backend, moved its app DB aside, booted a fresh one on 4105 (`has-user-setup:
false`, live `setup-token`), and called `POST /api/testing/snapshot/pw-blank-verify`
-> `e2e/snapshots/pw_blank_verify.sql` (1 user = the internal system user, 93
baseline cards). It is a **new, unreferenced filename** — no shared file was
clobbered. I deliberately **kept** it, because without it this spec cannot run on
this box at all; it is inert for every other spec.

`restoreBlank` defaults to plain `"blank"`, so committed behaviour is exactly
upstream's `H.restore("blank")`. `PW_BLANK_SNAPSHOT` only overrides the snapshot
*name*:

```
PW_BLANK_SNAPSHOT=pw-blank-verify bunx playwright test tests/onboarding-setup.spec.ts
```

**Every green run reported below used that override.** On a box with a correct
`blank.sql` the override is unnecessary.

**Recommended follow-up: regenerate `e2e/snapshots/blank.sql` on this machine.**

### MB_SITE_URL (#39)

Not triggered. The setup wizard writes `site_name`, `site_locale` and
`allow_tracking` via `POST /api/setup` — it never writes `site-url`, so the
pinned-env conflict does not arise. Confirmed `site-url` reads
`http://localhost:4105` throughout.

## 4. Infra tier

**None.** Ran with `PW_QA_DB_ENABLED=1` and the **gate-OFF control** (variable
unset): **identical, 14 passed** both ways.

The upstream `@external` tag on the two browser-locale tests is **over-broad**:
those tests click "MySQL" and "SQLite" in the driver *picker* and immediately
remove them, then continue with sample data — no QA container is contacted. The
one test that really connects a database uses SQLite against the in-repo
`./resources/sqlite-fixture.db` and is untagged. Nothing needs
postgres/mysql/mongo/maildev/webhook-tester; `maildev-ssl` being down is
irrelevant since `email-configured?` is *mocked*. `WRITABLE_DB_ID` is not used.

## 5. Genuine port drift found and fixed

**`getByText(..., { exact: true })` on an element with element children.**

`cy.findByText("Here are some explorations of")` passes upstream because
testing-library matches on `getNodeText`, which concatenates only an element's
**direct child text nodes**. The markup is
`<HomeCaption>{"Here are some explorations of"}<DatabaseInfo/></HomeCaption>`
(`HomeXraySection.tsx:99`), so testing-library sees exactly the caption. Playwright
matches full `textContent` *including descendants* —
`"Here are some explorations ofSQLite db"`.

Measured on 4105 after connecting the SQLite db (section rendered, `main`
innerText = `"…Here are some explorations of\nSQLite db\n…"`):

```
exact: true  -> 0 matches
exact: false -> 1 match
```

Fixed to substring matching with the reasoning inline. **This is a general
Cypress->Playwright hazard** worth propagating to other ports: any
`cy.findByText` on a caption that wraps a nested element component will drift
this way.

## 6. The one fixme

`should create a new user upon inviting a teammate` — marked `test.fixme` with a
~30-line comment. **Not port drift.** The backend `invite_sent` snowplow event is
silently dropped before it leaves the JVM whenever the test is preceded in the
same run by a test that itself generated backend snowplow traffic.

Evidence:

- alone, and `--repeat-each=4` -> **passes**, ~1.4s each
- preceded by "pre-fill user info" (never completes setup, emits no backend
  events) -> **passes**
- preceded by the two browser-locale tests (drive setup to completion) ->
  **fails, 4/4 runs**
- raising the poll 30s -> 60s -> **still fails** (so not latency)

On failing runs the collector logs **exactly 3 POSTs** and decodes 3 events
(`setup/step_seen`, `account/new_user_created` x2) with **0 malformed** — the
event is never sent, rather than sent-and-lost or sent-and-misparsed. At that
moment the instance reports `anon-tracking-enabled=true`,
`snowplow-available=true`, `snowplow-enabled=true`, and `POST /api/user` returns
**200** with `is_superuser: true` and groups `[1,2]` — so `invite-user!`
definitely took the `source = :setup` branch that calls
`analytics/track-event! :snowplow/invite`. Every non-snowplow assertion passes.

**Leading hypothesis, explicitly NOT proven:**
`metabase.analytics.snowplow/tracker` is a `defonce` wrapping a
`PoolingHttpClientConnectionManager`, while `support/snowplow-collector.ts` never
sets `keepAliveTimeout`, so node closes idle keep-alive sockets after its 5s
default. A send over an already-closed socket would fail, and `track-event!`
catches `Throwable` and only logs — and the e2e log4j config suppresses that log,
making the drop invisible. This fits every observation (cold pool works, warmed-
then-idled pool does not), but **I could not confirm the socket-level failure, so
I am recording the mechanism as unexplained rather than asserting it.**

Obvious first thing to try: `server.keepAliveTimeout = 0` in the collector. That
is a **shared support module**, which this port must not edit — flagging for the
owner. This likely affects **any** spec asserting a backend-emitted snowplow
event after an idle gap.

## 7. Mutation testing

Input inverted, never the expectation. Where each mutant died mattered.

| # | Mutation | Result |
| --- | --- | --- |
| M3 | drop `use_case=embedding` from the no-step-numbers test | **Killed, but at the WRONG line** — died on the `"What should we call you?"` precondition, never reached the step-number check. **My mutation was bad**; it changed the flow, not the condition |
| M3b | keep `use_case=embedding`, drop only the `is-hosted?` / `token-features:{hosting}` mocks (the actual condition under test) | **Killed at the right line**: `toHaveCount(0)` received **1**. The absence assertion is not vacuous |
| M1 | assert help-card absence immediately after selecting MySQL | **SURVIVED** — see below |
| M1b | same, but let the 0.4s reveal animation settle first | **Killed at the right line** |
| M2 | drop the post-user-creation `selectLanguage("English")` | **Killed** at the first counting assertion: expected 1, received **0** |

**The M1 survivor, answered.** Per the rule I asserted *presence* under the same
mutation: `toBeVisible()` passed immediately before, so the card really was
there. Direct measurement then explained it — both states are `isVisible()=true`
to Playwright, and they differ only in geometry against the measured 720px fold:

```
hidden (no DB selected):  y = 860   -> below the fold  -> helper passes (correct)
shown  (DB selected):     y = 574   -> within the fold -> helper fails  (correct)
transient, just after the reveal click: y = 847 -> below the fold
```

So the helper **does** discriminate; M1 survived because
`expect.poll(...).not.toBe("onscreen")` is satisfied by the *first* offscreen
sample and caught the pre-animation position. M1b, with a 1.2s settle, kills it.

Upstream's `should("not.be.visible")` retries-until-satisfied identically, so
this is a **faithful port of an upstream weakness, not one introduced here**. I
recorded the caveat in the helper's docstring: do not use it to prove a card
*stays* hidden without settling first.

## 8. Vacuous upstream assertions kept verbatim (with analysis inline)

- `H.main().findByText("Embed Metabase in your app").should("not.exist")` — **no
  component in `frontend/src` renders that literal** (the real header is "Get
  started with Embedding Metabase in your app"). Cannot fail regardless of
  behaviour. Kept, because guessing the intended string would change coverage.
- `should("be.empty")` on `<input>` (x2) — asserts "no child nodes", vacuous for a
  void element. Ported as the `toHaveValue("")` it was reaching for; **this is a
  deliberate strengthening and is flagged as such** in both places.
- `findByDisplayValue(x).should("exist")` — an any-field check; ported as
  per-field `toHaveValue`. **Deliberate strengthening**, flagged inline.

## 9. Verification

```
tsc --noEmit                                    -> clean
full suite                                      -> 14 passed, 1 skipped (fixme)
--repeat-each=2                                 -> 28 passed, 2 skipped
gate-OFF control (no PW_QA_DB_ENABLED)          -> 14 passed, 1 skipped
```

All green runs used `PW_BLANK_SNAPSHOT=pw-blank-verify` (§3).

No Cypress cross-check was run. Jar never switched.

## 10. Cleanup / state left behind

- Slot-5 backend: **`restore/default` applied**, verified `has-user-setup: true`,
  `site-url: http://localhost:4105`. My manually-booted JVM was killed so the next
  run boots through the harness; the moved-aside app DB leftovers were removed.
- Scratch spec `tests/zz-scratch-invite-probe.spec.ts` deleted. All probe
  instrumentation reverted (grep-verified clean).
- No `test-results-*` dir of mine. **`test-results-dm3/` belongs to a sibling
  (data-model-shared-3) — deliberately left alone.**
- **Kept on purpose:** `e2e/snapshots/pw_blank_verify.sql` (gitignored, inert,
  documented in the spec header).
- Not touched: `PORTED.txt`, `QUEUE.md`, `build-helper-index.mjs`, any shared
  support module. Nothing committed. Port 4000 never touched.

---

## Three-line summary

The inherited spec and support module were sound and were adopted after verifying
their load-bearing claims; the 15-way failure was **not** the port but this box's
corrupt `e2e/snapshots/blank.sql`, which contains the fully-set-up state (11
users) instead of a blank instance — proven with a same-backend restore control.
Against a correct blank snapshot the port runs 14 passed / 1 fixme, stable over
`--repeat-each=2` and unchanged with the QA-DB gate off; I fixed one real drift
(a Cypress `getNodeText` vs Playwright `textContent` exact-match difference) and
killed 4 of 5 mutants, explaining the survivor as a faithfully-ported upstream
weakness.
The two follow-ups the harness owner needs: **regenerate `blank.sql`**, and
investigate backend snowplow events being dropped after an idle gap (leading but
unconfirmed hypothesis: the collector's default 5s keep-alive vs the backend's
`defonce` pooled HTTP client).
