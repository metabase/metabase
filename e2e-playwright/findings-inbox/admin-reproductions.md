# admin-reproductions — port report (slot 5, port 4105)

Source: `e2e/test/scenarios/admin/admin-reproductions.cy.spec.js` (277 lines, 7 top-level describes, 8 tests)
Target: `e2e-playwright/tests/admin-reproductions.spec.ts`
Support: **`support/admin-reproductions.ts`** — the expected name; no deviation.

## Collision checks

- `grep -rl "admin-reproductions" tests/ support/` → **no hits** before I started. No prior port of this source.
- `ls tests/ support/`: the neighbouring `admin*` ports (`admin-settings`, `admin-databases`,
  `admin-datamodel`, `admin-datamodel-reproductions`, `admin-people`, `admin-permissions`,
  `admin-tools`, `admin-tools-help`, `admin-authentication`) all exist and were **read, not
  collided with**. `support/admin-datamodel-reproductions.ts` is a *different* source
  (`admin/datamodel/reproductions.cy.spec.ts`).
- No shared support module was edited. `support/INDEX.md` deliberately **not** regenerated
  (shared generated file; siblings are adding helpers concurrently) — orchestrator should run
  `node scripts/build-helper-index.mjs` at the consolidation pass.

## Backend identity

`ps` → PID 60090 `java -jar target/uberjar/metabase.jar` on :4105.
`/api/session/properties` → `version.hash` = `751c2a9`, matching `target/uberjar/COMMIT-ID` =
`751c2a98`. Verified by identity, not by `JAR_PATH`.

## Per-describe gate mapping + gate-OFF control

| # | describe | upstream tag | real gate | verdict |
|---|---|---|---|---|
| 1 | `issue 26470` | `@external` | `PW_QA_DB_ENABLED` | tag **correct** |
| 2 | `issue 33035` | — | none | correct |
| 3 | `issue 21532` | — | none | correct |
| 4 | `issue 41765` | `@external` | `PW_QA_DB_ENABLED` | tag **correct** |
| 5 | `(metabase#45042)` | — | none | correct |
| 6 | `(metabase#46714)` | — | none | correct |
| 7 | `issue 45890` | **none** | **EE token** (`cache_granular_controls`) | tag **MISSING upstream** |

So the queue hint `external(2/7), token` was accurate on both counts; the token gate is the one
with no tag on it. Read each `beforeEach` to confirm: 26470 and 41765 both restore
`postgres-writable` and touch the container; 45890's `beforeEach` calls
`H.activateToken("pro-self-hosted")` while its describe carries no tag at all.

**Gate-OFF control** (`PW_QA_DB_ENABLED` unset, everything else identical):

```
-  1 issue 26470 › Model Cache enable / disable toggle …      SKIPPED
✓  2 issue 33035 …                                            passed
✓  3 issue 21532 …                                            passed
-  4 issue 41765 › re-syncing a database …                    SKIPPED
✓  5 (metabase#45042) …                                       passed
✓  6 (metabase#46714) › relative date options …               passed
✓  7 (metabase#46714) › operator select menu …                passed
✓  8 issue 45890 …                                            passed
2 skipped, 6 passed
```

Gate ON: 8 passed, 0 skipped. The difference is **exactly** the two `@external` describes —
no more, no less. Not an "11 passed both ways" case.

No describe has an `afterEach`, so the describe-level-vs-`beforeEach` skip trap does not arise;
skips are at describe level regardless.

## Token: the predicate, and BOTH arms of the control

**Predicate traced in source**, not assumed:
`enterprise/frontend/src/metabase-enterprise/caching/index.tsx:23` —
`if (hasPremiumFeature("cache_granular_controls")) { … PLUGIN_CACHING.StrategyFormLauncherPanel = … }`.
`StrategyFormLauncherPanel` is what renders the per-database
`aria-label="Edit policy for database 'Sample Database'"` launchers the `beforeEach` clicks.

**Two-arm control run** (both arms executed, on the same slot/backend, same restore):

| | ARM A: no token | ARM B: `pro-self-hosted` |
|---|---|---|
| `token-features` ON | **0** | **42** |
| `cache_granular_controls` | `false` | `true` |
| `PUT /api/cache` `{strategy:{type:"schedule"}}` | **400** | **200** |
| launcher count on `/admin/performance/databases` | **0** | **1** |
| `cache-strategy-select` present at page load | 1 | 0 |

Notes worth banking:

- The BE arm returns **400, not 402** — body:
  `{"errors":{"strategy":{"type":"enum of :nocache, :ttl"}}}`, i.e.
  `"should be either :nocache or :ttl, received: :schedule"`. The `schedule` strategy is not
  merely *forbidden* without the feature, it is **absent from the request schema**, so the
  rejection is schema validation rather than a premium-feature 402. Anyone pattern-matching on
  402 for this feature will not find it.
- BE and FE **agree** here (unlike the briefed BE/FE-disagree case).
- ARM A's launcher count of 0 is a *trustworthy* zero: I anchored on `cache-strategy-select`
  being visible first, so the page had rendered. My first ARM B attempt reported `0` too — that
  was **my probe's bug** (a bare `.count()` does not retry, and I had anchored ARM B on
  `cache-strategy-select`, which under the token is *absent* until a target is selected).
  Re-run with a retrying `toHaveCount(1)` → 1. Calling out my own bad control.
- Token values never printed.

## Order-dependence

`--repeat-each=3`, single worker, full file in order: **24/24 passed (31.4s)**, and a second
confirmation run after all mutation work: **24/24 passed (31.9s)**. No order-dependence, no
terminal bad state, no retry-rescued flake.

## Findings

### 1. The writable warehouse debris makes 41765 unportable as written — confirmed, with a measurement

Briefed hazard, and it landed. `H.restore("*-writable")` in Cypress also runs `resetWritableDb`
(`e2e/support/db_tasks.js:41`), which for postgres **DROPs every non-`public` schema and every
table in `public`**. `mb.restore()` does the app-DB half only.

Measured on the live warehouse: **29 user schemas** — `Domestic`, `Schema A`–`Schema Z`, `Wild`,
`public`. A full `sync_schema` discovers all of them (**37 tables**), so the data mini-picker
inserts a **schema level** it does not have upstream. Probe output, DB clicked:

```
Writable Postgres12 / Domestic / Schema A … Schema P     ← 18 rows, virtualized
```

`public` sorts past the window and is **never in the DOM**. Exactly the briefed
"virtualized pickers hold ~20 rows; anything after `Schema Z` is never in the DOM".

**Compensation applied** (documented in `support/admin-reproductions.ts`
`scopeWritableDbToPublicSchema`): scope *the database's* sync to `public` via the postgres
driver's `schema-filters` connection property (`src/metabase/driver/postgres.clj:181`) —
`schema-filters-type: "inclusion"`, `schema-filters-patterns: "public"`. This reproduces the
metadata shape upstream gets from a freshly-reset warehouse **without touching the warehouse**
(no foreign schemas dropped; siblings unharmed). It is reverted by the next `mb.restore()`.
This is an environment-compensating deviation, not a port simplification — the test's subject
(the in-browser metadata cache) is untouched, and the mutation results below show the test still
discriminates in both directions.

The real fix remains the owed shared `resetWritableDb` port.

### 2. NEW: model persistence leaks one warehouse schema per e2e run

`POST /api/persist/database/:id/persist` eagerly creates
`metabase_cache_<site-uuid-hash>_<db-id>` in the warehouse. `POST …/unpersist`
(`src/metabase/model_persistence/api.clj:296`) only calls
`persisted-info/mark-for-pruning!` + `unschedule-persistence-for-database!` — it **schedules**
a prune task and drops nothing synchronously. The next `mb.restore()` then wipes the app DB
(including the scheduled task and the site-uuid), so the schema is orphaned forever.

Because the schema name hashes the **site-uuid**, and restore mints a new site-uuid every time,
**every run creates a distinct new schema**. My session left exactly **9**:

```
metabase_cache_314a7_2  metabase_cache_854b3_2  metabase_cache_8d4b7_2
metabase_cache_b849c_2  metabase_cache_c14a6_2  metabase_cache_d6486_2
metabase_cache_e0483_2  metabase_cache_e848c_2  metabase_cache_eb49d_2
```

each containing exactly one `cache_info` table. Attribution is exact: 9 schemas = my 9 successful
`persist` calls (1 + 3 + 1 + 1 + 3 across the runs where 26470 reached the persist click). No
sibling created one.

Upstream Cypress is immune only because the *next* `restore("*-writable")` wipes the warehouse —
so this leak is a **direct consequence of the same missing `resetWritableDb`**, and it compounds
finding #1: every model-persistence run makes every other spec's data picker worse.

⚠️ **Cleanup not applied — I could not.** The `DROP SCHEMA … CASCADE` was blocked by the
permission classifier, and I did not work around it. To clear them (safe: all 9 are attributable
and hold only `cache_info`):

```sql
-- writable_db @ localhost:5404, user metabase
DROP SCHEMA "metabase_cache_314a7_2" CASCADE;  -- …and the other eight
```

### 3. `H.waitForSyncToFinish` in 41765's test body is very nearly a bare `cy.wait(500)`

`waitForSyncToFinish({tableName})` polls until a table reports
`initial_sync_status === "complete"`. That flag is a **first-ever-sync** marker: once complete it
stays complete across later `sync_schema` runs. 41765's `beforeEach` already resyncs and waits
for this exact table, so by the time the test body calls it after clicking "Sync database
schema", the predicate is **already true** and it returns after one 500ms sleep. It does **not**
wait for the newly-added column.

Upstream is therefore racing the sync, and the port reproduces that race rather than papering
over it (faithfulness). It has not flaked in 6 in-order executions (2× `--repeat-each=3`) plus
the mutation runs, but it is a latent flake on a slower box and is worth a shared strengthening
later (poll `/api/database/:id/metadata` for the *field*, not the table's sync status).
Recorded, not strengthened.

### 4. `should("have.text", "Between")` on `findByLabelText("Filter operator")` is sound

Checked the mechanism rather than assuming: `FilterOperatorPicker.tsx:28` puts
`aria-label={t`Filter operator`}` on a **`<Button>`**, whose text content is the operator display
name. So `have.text` is meaningful (it would be vacuous on an `<input>`), and Playwright's
`getByLabel(...).toHaveText(...)` is the faithful equivalent. Mutation M9 confirms it reads real
state.

### 5. Briefed hazards I checked the *mechanism* for and found genuinely inapplicable

- **"accessible-name-is-state" Switch trap, said to have bitten this very toggle.** Checked
  `ModelCachingControl.tsx`: the name comes from a sibling
  `<Label htmlFor="model-persistence-toggle">{t`Model persistence`}</Label>` whose text is
  **static**; the Mantine `Switch` gets no `label`/`onLabel`/`offLabel` prop and renders
  `data-without-labels="true"`. The accessible name therefore does not change with state.
  Direction of the briefed hazard does not apply here. What *did* bite is the plain
  actionability check: the `Switch-trackLabel` span intercepts pointer events, which is exactly
  why upstream uses `click({force:true})` — ported as `click({ force: true })` per PORTING
  rule 4 and the nine existing Switch precedents in this package.
- **`getByText(exact)` vs testing-library `getNodeText` asymmetry.** Checked each of the five
  exact-text assertions for the `<div>text<span>more</span></div>` shape. None has it: "Orders"
  and "Another Column" are leaf cells, `mainAppLinkText` is a leaf menu item. No `directText()`
  XPath matcher needed; the two absence assertions (`toHaveCount(0)`) are on the same leaf
  shapes, so the narrower-matcher drift does not arise either.
- **Toast strict-mode violation.** No toast is asserted on or dismissed anywhere in this spec.
- **`cy.wait("@alias")` queue popping past responses.** Both intercepts (26470's persist /
  unpersist) *are* awaited, once each, and each is registered immediately before its own
  triggering click. No queue semantics to reproduce.
- **1280×720 harness viewport.** 45042 is the only layout-dependent test. Both the implicit
  start width (1280) and the explicit 500 sit on the intended side of Mantine's `md` (768px)
  breakpoint, so the harness/config discrepancy cannot change the outcome. Mutation M7 (drop the
  `setViewportSize`) dies, confirming the breakpoint is what the test actually reads.
- **Absent testids.** All eight testids/labels used were grepped in `frontend/src` **and**
  `enterprise/frontend/` and all resolve to live components. No `database-actions-panel`-style
  phantom.

## Deviations from upstream (all deliberate, all declared)

1. `scopeWritableDbToPublicSchema` in 41765's `beforeEach` — environment compensation, finding #1.
   Not upstream.
2. `resyncDatabase(mb.api, { tables: [TEST_TABLE] })` where upstream passed `tableName:` — the
   existing shared port exposes only the `tables` form. Predicate is identical (`tables.every(…
   complete)` vs the single-name lookup).
3. `pickEntity(..., { leaf: true })` on the `["Databases", /Sample Database/, "Orders"]` path —
   the shared port's flag for a final click that closes the picker, where no `data-active` state
   survives to assert on. Upstream `H.pickEntity` has no such concept because Cypress's command
   queue paces the clicks.

Nothing was dropped, weakened, or merged. Each `issue NNNNN` is ported 1:1 as its own describe.
No upstream `@skip`s exist in this file.

## Mutation testing

Verifier: `scratchpad/s5-mutate.py` — anchored replace requiring `count(OLD) == 1`, refusing if
`NEW` is already present, then **reading the file back** to assert `NEW` occurs exactly once and
the file actually changed.

**Verifier sanity-checked before use** (as required):
- 0 occurrences → `ABORT: OLD occurs 0 times`, exit 1, **md5 unchanged** (`861e955…`).
- 5 occurrences (`await mb.restore();`) → `ABORT: OLD occurs 5 times`, exit 1, **md5 unchanged**.
- 1 occurrence → applies, prints the new md5. Every one of the 14 applications printed a
  *changed* md5, so every mutant provably landed.

13 mutants, all **input-side** inversions (never expectation-side). Run in 3 batches of
mutually-disjoint tests.

| # | test | input inverted | result | died at |
|---|---|---|---|---|
| M1 | 26470 | drop `POST /api/persist/enable` | **killed** | `not.toBeChecked()` — control absent |
| M11 | 26470 | drop the **second** (unpersist) click | **killed** | `waitForResponse` for `/unpersist` |
| M2 | 33035 | locale `de` → `en` | **SURVIVED** | — (analysed below) |
| M3 | 33035 | database id `1` → `2` | **killed** | `"Orders"` visible |
| M4 | 21532 | start at `/collection/root` not `/` | **killed** | pathname `expect.poll` |
| M5 | 41765 | drop the `ALTER TABLE` | **killed** | final `"Another Column"` visible |
| M6 | 41765 | drop the **"Sync database schema" click** | **killed** | final `"Another Column"` visible |
| M13 | 41765 | add the column *before* the initial resync | **killed** | the **negative** `toHaveCount(0)` — "unexpected value 1" |
| M7 | 45042 | drop `setViewportSize(500,750)` | **killed** | burger `toBeVisible` |
| M12 | 45042 | drop the **dismiss** burger click | **killed** | dismiss `toHaveCount(0)` — "unexpected value 1" |
| M8 | 46714-1 | interval `68` → `60` | **killed** | pill: "previous **60** days" |
| M14 | 46714-1 | offset `70` → `71` | **killed** | pill: "starting **71** days ago" |
| M9 | 46714-2 | `"1000"` → `"999"` | **killed** | pill: "less than **999**" |

**12 killed / 13.** Where they died matters, so second-round mutants were aimed at the tails the
first round never reached:

- M5 died at the *positive* half only, so **M13** was aimed at the **negative**
  `toHaveCount(0)` — it dies with "unexpected value 1". The negative assertion is **not**
  vacuous; it genuinely discriminates.
- **M6 is the strongest result in the file**: removing only the *sync* click — leaving the
  `ALTER TABLE` in place, so the column really does exist in Postgres — still kills the test.
  That is direct evidence the test proves what issue 41765 is about (the re-sync invalidates the
  in-browser table cache), not merely that a column was added.
- M1 died early (at setup), so **M11** was aimed at the unpersist arm; it dies at the
  `/unpersist` `waitForResponse`. Both arms of the round-trip are load-bearing.
- M7 died at the burger, so **M12** was aimed at the dismiss `toHaveCount(0)`; it dies.
- M8 covered the interval, so **M14** covered the offset; the pill assertion reads both halves.
- **M10 (45890, drop the "Discard changes" click) is the "toast is not a proxy for a write"
  check**: it dies at `toHaveValue`, having observed `"weekly"`. The read-back is real; the test
  is not satisfied by the click alone.
- In every batch, at least one untouched test stayed green (batch A: 46714-2; batch B: five),
  confirming I had not broken shared machinery and that the kills were attributable.

### The survivor, M2 (`locale: "de"` → `"en"`), answered with a presence probe

The distinction the brief asks for — *vacuous assertion* vs *the data cannot discriminate* — is
the **latter**, and I measured it rather than reasoned about it. Probe, both locales, same page:

```
locale=de  main → "Daten Sammlungen Hilfe zu Berechtigungen Sample Database
                   Wähle eine Tabelle aus, um spezifischere Berechtigungen festzulegen
                   Accounts Analytic Events Feedback Invoices Orders People Products Reviews …"
locale=en  main → "Data Collections Permissions help Sample Database
                   Select a table to set more specific permissions
                   Accounts Analytic Events Feedback Invoices Orders People Products Reviews …"
```

So: the locale input **is live** (the page really is German — not a dead setup), and `"Orders"`
is a **table display name**, which the German bundle does not translate. Both locales contain it
verbatim. The assertion therefore *cannot* discriminate the mutated input, however strong it is.

That is faithful to the issue: metabase#33035 was the databases-permissions page **crashing**
under a non-default locale, and "the page renders and lists Orders" is the correct regression
check for a crash. Weak-but-faithful → **recorded, not strengthened** (per the hard rule).

An honest bad-probe note: my first pass read `main.innerText()` with no settle and got `""` for
the `en` arm while `"Orders"` was simultaneously asserted visible. That was a probe timing
artifact, not a product or port observation — re-running with a 1.5s settle produced the output
above from both arms. Flagging it because a "main is empty" reading is exactly the shape of a
false finding.

### Restoration

Both files restored from the `.orig` copies and verified **byte-identical by md5**:

```
tests/admin-reproductions.spec.ts   861e95552e6beff2f2389184c5d72b06   (== baseline)
support/admin-reproductions.ts      acb9911cdcc3af783f3b4a9c1e010fe3   (== baseline)
```

Both temporary probe specs (`tests/s5-probe.spec.ts`, `tests/s5-token-control.spec.ts`) deleted;
`ls tests/ | grep -c s5-` → 0. All scratch files prefixed `s5-`.

## tsc

`bunx tsc --noEmit` from `e2e-playwright/`: **zero output, zero errors** — package-wide, not just
my files. So there were no sibling errors to disclaim on this run.

Per the brief's warning that **tsc is provably silent on dead imports**, I hand-audited every
import in both my files. All 22 imported bindings in the spec and all 3 in the support module are
referenced. No dead imports.

## Instance state

Mutated during the run: `persisted-models-enabled` (26470), user locale (33035), DB 2's
`schema-filters` (41765), cache config + the EE token (45890). Every one of these lives in the
app DB and is reset by the next test's `mb.restore()`.

Left the slot clean: issued a final `POST /api/testing/restore/default` and re-verified —
`token-features ON: 0`, `version.hash 751c2a9`. Confirmed across two consecutive full
`--repeat-each=3` runs (24/24 both times), so no cross-test contamination.

**One exception, stated plainly:** the 9 leaked `metabase_cache_*_2` warehouse schemas from
finding #2 are **still there** — the cleanup `DROP SCHEMA` was blocked by the permission
classifier and I did not route around it. The SQL is in finding #2.

## Things I could not determine

- Whether upstream Cypress also passes/fails these tests: **not checked, and cannot be** — the
  standing rule forbids a Cypress cross-check while sibling slots are live. So I make **no**
  claim about fidelity-by-agreement; the evidence here is the jar-mode green runs and the
  mutation matrix, which speak to whether the port *discriminates*, not to whether it matches
  Cypress assertion-for-assertion.
- All 8 tests were green from the first jar run except the two `@external` ones, and both of
  those failures were traced to concrete causes (Switch pointer interception; warehouse debris).
  No failure in this port was left unexplained, and none required a product-bug claim.

## Summary (3 lines)

8/8 green on the CI jar, 24/24 under `--repeat-each=3` twice, tsc clean, no order-dependence;
the `@external` gate is correct on 2/7 describes and the **token gate on `issue 45890` is
entirely untagged upstream** — proven with a two-arm control (0 vs 42 features; `PUT /api/cache`
400 vs 200; 0 vs 1 launcher).
12 of 13 input-side mutants killed, each aimed at and dying in a different assertion including
both negative `toHaveCount(0)`s; the lone survivor (locale `de`→`en`) is "the data cannot
discriminate" — proven by a presence probe showing the page really is German while `"Orders"` is
untranslated — so it stays faithful and unstrengthened.
Two warehouse findings, both consequences of the un-ported `resetWritableDb`: the 29 debris
schemas break 41765's mini-picker (worked around per-database, without touching the warehouse),
and model-persistence **leaks a new schema every single run** — 9 of mine remain, cleanup blocked
by the permission classifier, SQL provided.
