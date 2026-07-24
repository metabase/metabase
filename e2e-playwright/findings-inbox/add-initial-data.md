# add-initial-data

Port of `e2e/test/scenarios/onboarding/add-initial-data.cy.spec.ts` (404 lines, 11 tests)
-> `tests/add-initial-data.spec.ts` + `support/add-initial-data.ts`.

Slot 4 / port 4104. Jar verified **by identity**: `/api/session/properties`
`version.hash = 751c2a9` vs `target/uberjar/COMMIT-ID = 751c2a98`. (The run log
says `(reused)`, so `JAR_PATH` alone would have proved nothing.)

## Headline

**11 passed, 0 fixme, 0 skipped, first run.** Stable over `--repeat-each=3`
(33/33). **12 mutants, 12 killed, 0 survivors**, each at the intended assertion.
No harness blocker; nothing about this spec needed a fix first.

---

## 1. Collision checks

- `grep -rl "add-initial-data" tests/ support/` → **nothing**. No inherited or
  uncommitted port of this source exists.
- Source dir `e2e/test/scenarios/onboarding/` — no same-basename `.js`/`.ts`
  sibling of `add-initial-data.cy.spec.ts`, so the `viz-charts-reproductions`
  hazard does not apply.
- `onboarding-setup`, `onboarding-sso`, `signin`, `homepage` all exist in
  `tests/` and come from unrelated sources. Read, not collided with.
- **Support module name does NOT deviate**: `support/add-initial-data.ts`
  matches `tests/add-initial-data.spec.ts`. Nothing to say loudly.

Shared modules imported read-only: `admin-people` (USER_GROUPS),
`api`, `click-behavior` (updateCollectionGraph), `collections-uploads`
(statusRoot), `entity-picker`, `filters-repros` (goToMainApp), `fixtures`,
`question-new`, `sample-data`, `search`, `search-snowplow`,
`table-column-settings`, `text`, `ui`. **None edited.**

## 2. Instance / snapshot state — the brief's blank-snapshot warning is INAPPLICABLE

Recording this rather than banking it as a hit: this is an *onboarding-directory*
spec, but it is **not** an onboarding-*flow* spec. Every test calls plain
`H.restore()` — the **`default`** snapshot. It never calls `restore("blank")`,
never visits `/setup`, and needs a fully-configured instance with the sample
database and the standard users. The corrupt `e2e/snapshots/blank.sql` that cost
`onboarding-setup` 15 tests **cannot** affect it, and I confirmed the harness
already provides what this spec does need (`has-user-setup: true`, sample DB
live, 11 tests green).

`MB_SITE_URL` (#39) is likewise **not triggered**: the spec writes
`uploads-settings`, `application-name`, `anon-tracking-enabled` and the
collection graph — never `site-url`. Confirmed `site-url = http://localhost:4104`
before and after.

### The real, undeclared state dependency (worth propagating)

The "Getting Started" sidebar section renders only when

```
shouldDisplayGettingStarted = isNewInstance && canAccessOnboarding
getIsNewInstance   = dayjs().diff(instance-creation, "days") <= 30
```
(`frontend/src/metabase/selectors/onboarding.ts:9`)

and `instance-creation` falls back to **the first user's creation timestamp**
baked into the snapshot (`src/metabase/analytics/settings.clj:80-88`). Measured
on this box after `restore/default`: `2026-07-17`, i.e. 3 days old — fine.

**But this is a 30-day fuse on a gitignored local artifact.** If
`e2e/snapshots/default.sql` on a box ages past 30 days, two tests
("…from the 'Getting Started' section" and the white-label test) start failing,
and the failure will look *exactly* like port drift. Same family as the
`blank.sql` finding, different snapshot and different mechanism. Cheap check:
`GET /api/session/properties` → `instance-creation`. Documented in the spec
header so the next person doesn't have to rediscover it.

## 3. Gate mapping, with the gate-OFF controls

Queue hint was **external(1/2 describes), snowplow, token**. Treated as a hint;
here is what the code actually says.

### `@external` — over-broad / red herring. Maps to ZERO gated tests.

The tag sits on the first top-level describe (`better onboarding via sidebar`),
and `@cypress/grep` propagates it to the nested `Add data modal analytics`
describe's 5 tests. But `@external` means "requires an external docker
container" (`docs/developers-guide/e2e-tests.md:251`) — and I read the
`beforeEach` rather than the tag:

```js
H.resetSnowplow(); H.restore(); cy.signInAsAdmin(); H.enableTracking();
```

`H.restore()` with no argument is the **`default`** snapshot, not
`postgres-12`/`mysql-8`. No test in that describe references `WRITABLE_DB_ID`,
a QA dialect, or any non-sample database; the one upload-adjacent test enables
uploads against `SAMPLE_DB_ID`. **The only external service the describe needs
is the snowplow-micro container** that `resetSnowplow` / `expectUnstructuredSnowplowEvent`
`cy.request()`. The port replaces micro with browser-boundary capture, so there
is nothing left to gate and **no `PW_QA_DB_ENABLED` skip was added**.

**Gate-OFF control** (the only trustworthy signal), same backend, back to back:

| run | executed | skipped |
| --- | --- | --- |
| `PW_QA_DB_ENABLED=1` | **11 passed** | 0 |
| variable unset | **11 passed** | 0 |

Identical both ways — i.e. the difference is exactly the zero tests the tag
should gate. Reported as executed-vs-skipped, not as "correctly skipped".

### Token — REAL, and it gates exactly one test.

`test.skip(!resolveToken("pro-self-hosted"), …)` on
*"should hide Getting Started but still offer to add data for white labeled
instances"*.

**Gate-OFF control**, token env blanked (`MB_PRO_SELF_HOSTED_TOKEN=""` — note
`support/env.ts` only backfills from `cypress.env.json` when the var is
`undefined`, so an empty string is a valid way to force the negative):

```
10 passed, 1 skipped   ← exactly the white-label test
```

### `snowplow` — real, and NOT dead setup

Checked the dead-setup trap first: this is not a `resetSnowplow()`-with-no-
assertions spec. All five tests in the tagged describe carry real
`H.expectUnstructuredSnowplowEvent` assertions (two of them count-qualified),
plus an `afterEach` `expectNoBadSnowplowEvents`. Rule 6's no-op stub would have
made all five vacuous.

## 4. Which snowplow vantage, and why

**Browser boundary (`installSnowplowCapture`), not the collector.** Decided from
the call sites as instructed, not from the tag:

| event | emission site | class |
| --- | --- | --- |
| `data_add_modal_opened` | `frontend/src/metabase/nav/containers/MainNavbar/analytics.ts:19` | `trackSimpleEvent` (FE) |
| `csv_tab_clicked` | `…/AddDataModal/analytics.ts:4` | `trackSimpleEvent` (FE) |
| `database_tab_clicked` | `…/AddDataModal/analytics.ts:4` | `trackSimpleEvent` (FE) |
| `database_setup_selected` | `…/AddDataModal/analytics.ts:20` | `trackSimpleEvent` (FE) |
| `csv_upload_clicked` | `…/AddDataModal/analytics.ts:14` | `trackSimpleEvent` (FE) |

`grep` over `src/` and `enterprise/` finds **no `.clj` emission site for any of
the five**. So they are entirely frontend-emitted → the per-slot collector is
structurally blind to them (and, per the brief, currently blind to *all* FE
events because its preflight omits `Access-Control-Allow-Credentials`).

**Consequence: none of the brief's backend-snowplow hazards apply here.** The
persistent-offset / "hollow green on your predecessor's event" trap is a
*backend* Tracker property; this spec asserts zero backend events, so I did not
need a fresh backend for event validity — and I am not claiming I used one.
Mutation testing (§6) independently rules out hollow greens: M6/M7/M8 each
changed which event the app emits and each failed with the *captured* list
printed, showing live per-test capture.

Recorded gap, unchanged from `search-snowplow`: `expectNoBadSnowplowEvents`
degrades to a structural well-formedness check and does **not** catch Iglu
schema-validation failures.

## 5. Token predicate — how I traced it

Two independent gates, and **BE and FE agree** here (unlike the cases the brief
warns about).

**Backend.** `application-name` is `defsetting … :feature :whitelabel`
(`src/metabase/appearance/settings.clj:13-21`). No escape hatch, and no
`(not is-hosted?)` short-circuit of the `transforms-basic` kind. Probed directly
on 4104 rather than inferred:

```
activate pro-self-hosted            -> 204,  token-features.whitelabel = true (42 features ON)
PUT /api/setting/application-name   -> 204,  application-name = "FooBar, Inc."
clear token                         -> 204
PUT /api/setting/application-name   -> 500,  application-name = "Metabase"
```

Note the getter is feature-gated too: clearing the token reverted the *read* to
the default while the row was still in the app DB.

**Frontend.** `getIsWhiteLabeling` is `getApplicationName(state) !== "Metabase"`
(`enterprise/frontend/src/metabase-enterprise/settings/selectors.ts:38`), and it
is only installed onto `PLUGIN_SELECTORS` by the EE whitelabel plugin
(`metabase-enterprise/whitelabel/index.ts:58`); the OSS default is
`() => false` (`frontend/src/metabase/plugins/oss/core.ts:101`). It feeds
`getCanAccessOnboardingPage = !isEmbeddingIframe && !isWhiteLabelled`.

So the surface is **conjunction-gated** (token AND changed app name) — the trap
the brief names. I probed both limbs separately (M4, M5 in §6); each alone
kills the test, so neither limb is decorative.

**Token values were never printed.** The brief's retracted `.env`-trailing-comma
advice did not arise: `support/env.ts` reads `cypress.env.json`, whose
`MB_PRO_SELF_HOSTED_TOKEN` is 64 chars and activates 204.

## 6. Mutation testing — 12 mutants, 12 killed, 0 survivors

Method: invert the **input**, never the expectation; anchored replace asserting
the anchor occurs **exactly once**; read the file back and eyeball the changed
site before interpreting any run; record **where** each mutant died.

| # | Mutation (input) | Result | Died at |
| --- | --- | --- | --- |
| M1 | CSV cell `value1` → `valueMUT` | **killed ×2** | `tableInteractiveBody toContainText("value1")` — the **tail**, after Header1/Header2 passed |
| M2 | CSV filename `foo-bar.csv` → `mut-qux.csv` | **killed ×2** | `crumbs toContainText("Foo Bar")` — tail, after the collection crumb passed |
| M3 | collection graph `SECOND_COLLECTION_ID: "write"` → `"read"` | **killed** | `expect(selectCollection).toBeEnabled()` |
| M4 | drop `activateToken` (PUT tolerated so it reaches the assertion) | **killed** | `getByText(/Getting Started/i)).toHaveCount(0)` |
| M5 | keep token, drop the `application-name` PUT | **killed** | same assertion |
| M6 | open the modal from the left-nav instead of "Getting Started" | **killed** | snowplow match; captured `triggered_from: "left-nav"` |
| M7 | insert a Database→CSV toggle before the "repeated click" | **killed** | the **count-qualified** `csv_tab_clicked, 1`; captured 2 |
| M8 | click `PostgreSQL` instead of `Snowflake` in the listbox | **killed** | `event_detail: "snowflake"`; captured `"postgres"` — *after* the pathname assertion passed |
| M9 | search `"re"` → `"zzzz"` | **killed** | `expectAnyContains(options, "Presto")` — the **middle** assertion |
| M10 | final engine click `Snowflake` → `PostgreSQL` | **killed** | `expectSearch("?engine=snowflake")` — the **tail**, after `expectPathname` passed |
| M11 | render the app in a normal page instead of the embedding iframe | **killed** | `getByText(/Getting Started/i)).toHaveCount(0)` |
| M12 | sign in as **admin** in "hidden for non-admins" | **killed** | `getByLabel("Add data")).toHaveCount(0)` |

Every mutation was confirmed landed by reading the file back before the run.

**Things worth calling out:**

- **Deliberately aimed at tails.** M1/M2/M8/M10 all died at late assertions with
  the earlier ones passing, so the "if every mutant dies at the first assertion,
  the tail is unproven" hole is closed for the four multi-assertion tests.
- **M11 is the important one.** It proves the full-app-embedding test's three
  absence assertions are **not** vacuous — the pre-paint-vacuity failure mode
  (#73) that has silently hollowed out other ports. My anchor ("Home" visible,
  plus asserting the Data section exists) holds under inversion.
- **M1 also validates the synthetic drag-drop.** The non-admin test gets its file
  through `dropFileOn`'s replayed `DataTransfer`, and it surfaced the *mutated*
  cell in the rendered table — so that code path really delivers the file rather
  than silently no-opping.
- **M4/M5 answer the conjunction question**, which is exactly the trap where a
  single-limb mutation "survives" and reads as vacuity.

**Two of my own tools misbehaved — calling them out per the rule:**

1. My mutate script's readback asserted `new_text_count == 1`. That is **wrong**
   whenever the replacement text legitimately appears elsewhere: M6 replaced a
   block with `await openAddDataModalFromSidebar(page);`, which occurs 9 times,
   so the script aborted **after already writing the file**. The mutation had in
   fact landed correctly (the pre-write `count(old) == 1` guard is the one that
   matters). Had I trusted the abort I would have run an unmutated-looking file
   that was actually mutated. Fixed the assertion and verified the site by hand.
2. The script's "LANDED @ line N" locator prints the **first** line matching the
   replacement's first line, which for common first-lines (`await page.goto("/")`)
   points at the wrong place. M11 reported line 144; the real site was 380.
   Verified every multi-line mutant with `sed` on the actual range instead.
3. Sanity-checked the dead-import checker itself (the brief's warning): injected
   an unused `TOTAL_GROUPS` import and confirmed it was flagged. On the real file
   it reports 38 imports, **0 unused**.

## 7. Port-fidelity decisions worth recording

Nothing was dropped, weakened or merged; all 11 upstream tests are present.

- **`findAllByRole("option").should("contain", x)` is chai-jquery's ANY-OF case**
  on a multi-element subject, not first-match. Porting it as `.first()` would
  **weaken** it and as a concatenation would **strengthen** it, so it is ported
  as `expectAnyContains` ("at least one option contains this text"), with
  `.and("not.contain","Presto")` as its exact negation. The substring match is
  case-sensitive to match jQuery `:contains`.
- **`cy.location(...).should("eq", …)` retries** → `expect.poll`, not a one-shot
  `page.url()` read (which would be stricter than upstream).
- **A `.within()` rooted at a `findByRole` carries an implicit existence
  assertion.** Both absence-check tests port that anchor explicitly, so
  `toHaveCount(0)` cannot pass on an unrendered page. M11/M12 confirm it works.
- **`selectFile(..., { action: "drag-drop" })` is NOT `setInputFiles`.** In
  `CSVUpload.tsx` the react-dropzone root and the hidden `UploadInput` are
  **siblings**, so they are genuinely different code paths — the two upstream
  tests deliberately exercise one each. Ported the drop as a replayed
  `dragenter`/`dragover`/`drop` with one shared `DataTransfer` (the
  precise-coordinate exception to "never port the bare 3-event dnd sequence").
- **`role="section"` is not a real ARIA role**; reused `ui.ts sidebarSection`'s
  attribute-selector approach, and added a FrameLocator twin for the embedding
  test (the shared helpers only take a `Page`).
- **No vacuous upstream assertions found.** Unlike the sibling port, this spec
  has no `should("be.empty")`/`not.have.value`/DOMRect-equality shapes, and
  nothing needed to be kept-verbatim-with-analysis. **Nothing was strengthened.**
- `cy.intercept("PUT", "/api/setting/uploads-settings") + cy.wait` is genuinely
  awaited and is triggered by the "Enable uploads" click, so it ports as a
  plain `waitForResponse` registered before the click — no `ResponseRecorder`
  queue needed (checked for the retroactive-`cy.wait` shape; it isn't one).

## 8. Warnings from the brief that were checked and did NOT apply

Reporting these as inapplicable rather than banking them:

- **Corrupt `blank.sql`** — spec uses `default` (§2).
- **Backend snowplow queue / persistent offset / fresh-backend requirement** —
  zero backend-emitted events asserted (§4).
- **Toast strict-mode lingering (`UndoListing.tsx:203`)** — this spec asserts no
  toasts. It reads the upload *status* container (`status-root-container`), which
  is not the `UndoListing` surface, and never asserts two toasts in sequence. I
  did not import `verifyAndCloseToast`.
- **#85 shared-writable-container debris** — never touched. No `WRITABLE_DB_ID`,
  no QA dialect, no schema/table listing. I created no foreign schemas and
  dropped none.
- **1280×720 viewport** — no layout-dependent assertion in this spec; no failure
  needed attributing there.
- **`cy.intercept(url, {statusCode:500})` empty-body trap, `res.setThrottle`,
  JWT `iat`, redirect mocking** — none present in the source.

## 9. Debris / state left behind

- Slot-4 backend: **`restore/default` applied and verified** —
  `application-name: Metabase`, `whitelabel: false`, `site-url:
  http://localhost:4104`, `has-user-setup: true`. My §5 manual token probe was
  restored the same way immediately after it ran.
- The two CSV tests each create a `foo_bar` upload table in the **slot-private**
  H2 sample database (`$TMPDIR/mb-pw-slot-4/…`, re-pointed by
  `fixtures.ts restore()`), not in any shared container. Inert, slot-local, and
  gone when the slot backend is recreated. Upstream leaks the same way.
- Scratch files are slot-prefixed as required: `scratchpad/s4-mutate.py`,
  `s4-spec.baseline.ts`, `s4-support.baseline.ts`, `s4-md5-baseline.txt`.
  No generic filenames written.
- **Spec and support module restored byte-identical after mutation testing**,
  confirmed by md5 against the pre-mutation baseline:
  `6136020b2f3ee6c18a1486d434659b09` / `97248fa5eee727065df5829695a766cf`.
- Not touched: `PORTED.txt`, `QUEUE.md`, `playwright.config.ts`, any shared
  support module. **Nothing committed.** Port 4000 never contacted; only 4104.
- **No Cypress cross-check was run** (sibling slots are live). I therefore
  **cannot** say whether upstream passes or fails identically, and am not
  implying it — nothing here needed a fidelity cross-check, since no test was
  fixme'd and no product-bug claim is made.

## 10. Verification summary

```
tsc --noEmit                                     -> clean (exit 0)
dead-import check (checker sanity-verified)      -> 38 imports, 0 unused
full suite (jar, PW_QA_DB_ENABLED=1)             -> 11 passed
--repeat-each=3                                  -> 33 passed
gate-OFF control (no PW_QA_DB_ENABLED)           -> 11 passed, 0 skipped
token gate-OFF control (blank token env)         -> 10 passed, 1 skipped
mutation testing                                 -> 12 mutants, 12 killed
```

---

## Three-line summary

Ported all 11 tests green first run and stable at `--repeat-each=3` (33/33), with
no fixmes: the queue's `@external` tag turned out to be a **red herring** —
`H.restore()` is the `default` snapshot and the only external service was
snowplow-micro, which browser-boundary capture replaces, so the gate-OFF control
is identical 11-passed both ways, while the **token gate is real** and maps to
exactly one test (10 passed / 1 skipped when blanked), traced to
`application-name`'s `:feature :whitelabel` plus the EE-only
`getIsWhiteLabeling` selector, probed live (204 with token, 500 without).
All five asserted snowplow events are **frontend-emitted `trackSimpleEvent`**
with no `.clj` emission site, so the browser boundary is the correct seam and
none of the backend-queue hazards apply; 12 mutants were killed 12/12, four of
them deliberately at tail assertions and one (M11) proving the embedding test's
absence checks are not vacuous.
The one thing worth propagating: this spec has a hidden **30-day fuse** —
"Getting Started" renders only while `instance-creation` (the snapshot's first-user
timestamp) is under 30 days old, so an aging local `default.sql` will fail two
tests in a way that looks exactly like port drift.
