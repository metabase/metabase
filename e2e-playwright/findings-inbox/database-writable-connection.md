# database-writable-connection

Port of `e2e/test/scenarios/admin/databases/database-writable-connection.cy.spec.ts`
(434 lines, 9 tests) → `tests/database-writable-connection.spec.ts`.
Support module: **`support/database-writable-connection.ts`** — the exact name the
brief specified, no deviation, so no dangling-import risk.

## Summary (3 lines)

1. Ported 9/9 tests, all green (9 passed, and 27/27 under `--repeat-each=3`) —
   but only under a token that carries `:writable-connection`. As shipped it
   activates `pro-self-hosted` verbatim like upstream, and the **local**
   `pro-self-hosted` token lacks that feature, so it skips 9/9 here.
2. Five mutants (A–E) kill all 9 tests; every test has at least one mutant that
   dies at its own assertion, including the tails.
3. One measured port-drift bug found and fixed (admin-toggle race), and one new
   trap recorded (a Mantine Switch whose *accessible name is its state*).

## Collision checks

- `grep -rl "database-writable-connection" tests/ support/` → only
  `tests/admin-databases.spec.ts` and `support/admin-databases.ts`, and only in
  their header prose naming this file as a neighbour they are *not* a port of.
  **No existing port, committed or uncommitted.**
- Source has no `.js`/`.ts` twin. `e2e/test/scenarios/admin/databases/` holds
  only this spec and `database-connection-strings.cy.spec.ts`.
- Read (not collided with): `admin-databases`, `database-routing-admin`,
  `database-details-permissions`. All reuse is read-only; no shared support
  module was edited.

## The missing `@external` tag: REAL GAP, and repo-wide

The queue is accurate — the describe carries **no tag at all**:

```
describe("scenarios > admin > databases > writable connection", () => {
```

It is nonetheless unambiguously container-tier: it restores `mysql-writable`
and issues raw `CREATE USER` / `CREATE TABLE` / `DROP USER` against the QA
MySQL container through `H.queryWritableDB(…, "mysql")`. Without the container
it cannot start.

**This is not unique to this spec.** Auditing every spec that restores a
`*-writable` snapshot: ~20 of ~50 carry no `@external` tag, including
`remote-sync`, `database-routing-admin`, `metrics-explorer`,
`transforms-codegen`, `table-editing`, `tenants`, and all four `dependencies/`
specs. So the convention has drifted repo-wide rather than this file being
uniquely mis-tagged. Worth a separate cleanup pass; **not** worked around here —
the port gates on `PW_QA_DB_ENABLED` regardless of the tag.

## Infra tier per describe, with the gate-OFF control

Single describe, two independent gates.

| gate | mechanism | gate-OFF control |
|---|---|---|
| container | `PW_QA_DB_ENABLED` (mysql-sample :3304, `writable_db`) | **9 skipped / 0 executed** with the env var unset |
| token | `:writable-connection` premium feature, probed at runtime | **9 skipped** on `pro-self-hosted`; **9 passed** on a feature-carrying token |

### `WRITABLE_DB_ID` red herring — checked, and it resolves the *other* way

The brief flagged that `2` is the read-only QA sample under `postgres-12`. Under
`mysql-writable` it genuinely IS the writable container. Verified on `body.name`
and `details` rather than the literal, following `admin-databases.spec.ts`:

```
GET /api/database  ->
  1  Sample Database  h2     file:$TMPDIR/mb-pw-slot-4/sample-database.db
  2  Writable MySQL8  mysql  writable_db  localhost:3304
```

### Token gate: real, and traced through the predicate

Probed all four tokens against slot 4 (`writable_connection` in
`/api/session/properties`):

```
pro-self-hosted  42 features  writable_connection = false
pro-cloud        44 features  writable_connection = false
starter           4 features  writable_connection = false
bleeding-edge    53 features  writable_connection = TRUE
```

Per the brief, a missing flag is not a gate until the consuming predicate is
read. Both consumers traced, and **neither has a short-circuit**:

- **FE** — `metabase-enterprise/writable_connection/index.ts` assigns
  `PLUGIN_WRITABLE_CONNECTION.WritableConnectionInfoSection` only under
  `hasPremiumFeature("writable_connection")`. The OSS default is
  `PluginPlaceholder`, which renders `null`, so the section and every testid
  this spec keys on simply do not exist.
- **BE** — `PUT /api/database/:id` runs
  `assert-has-feature :writable-connection` whenever `write_data_details` is
  present (`warehouses_rest/api.clj:1104`).
- The setting is a plain `define-premium-feature enable-writable-connection?
  :writable-connection` (`premium_features/settings.clj:367`) on the stock
  `default-premium-feature-getter` — **not** the `query-transforms-enabled?`
  shape (`(not is-hosted?)` short-circuit) that produced the retracted
  "transforms are token-blocked" claim. This gate really does fire.

**Not a product finding.** This is a local token gap: upstream runs the spec on
`pro-self-hosted`, so CI's token evidently carries the feature. The spec keeps
`pro-self-hosted` verbatim — swapping it would silently change what upstream
tests — and the runtime probe skips only where the local token is short.

*Note on the `.env` trailing-comma trap from the brief: it did not apply. Tokens
resolve from `cypress.env.json` (all four are clean 64-char values), which is
what `resolveToken` reads. Flagging that the brief's claim did not reproduce on
this path.*

## `GET /api/database` inventory, before and after

Identical:

```
BEFORE                                   AFTER
1 Sample Database h2  write=null         1 Sample Database h2  write=null
2 Writable MySQL8 mysql write=null       2 Writable MySQL8 mysql write=null
```

### Shared-container inventory (the real blast radius)

The app DB is per-slot; the **mysql container is shared with four live slots**,
so that is what was actually checked.

```
BEFORE  writable_db tables (4): composite_pk_table, many_data_types,
                                no_pk_table, scoreboard_actions
        mysql users (6): metabase@%, mysql.infoschema@localhost,
                         mysql.session@localhost, mysql.sys@localhost,
                         root@%, root@localhost

AFTER   writable_db tables (4): identical  (+ upload_invalid_*, FOREIGN — see below)
        mysql users (6): identical — no readonly_user left behind
```

**Residue I created and cleaned up:** the model-persistence test orphans one
`metabase_cache_<uuid>_2` schema **per run**. `restore()` regenerates
`site-uuid`, and the schema name derives from it
(`getModelCacheSchemaName`), so every execution makes a *new* one. Eight had
accumulated across my verification + mutation runs. Attributed by contents
(`model_98_test_model`, this spec's fixture) rather than by timestamp, and
dropped — 8 total across two passes. Attribution was then **confirmed**: the
next single run created exactly one new schema, which I also dropped.

Upstream has the same gap (its `afterEach` drops only the user and two tables),
so this is inherited behaviour rather than port drift — but it is a genuine
shared-container leak worth fixing upstream.

**Foreign debris deliberately left alone** (siblings are live):
`metabase_cache_f34ad_2` (contains only `cache_info`, unattributable) and
`upload_invalid_20260720040640` (from `INVALID_CSV_FILES`, which this spec never
uses — a sibling agent is concurrently porting `collections-uploads`).

**Two measurement traps worth recording:**
- `information_schema.tables.create_time` is unreliable here — it reported an
  upload table as 19h old that had in fact just appeared. Do not attribute
  debris by it.
- The container clock runs ~7h behind the host, so the timestamps embedded in
  `upload_<name>_<ts>` table names are **container-local**. This made fresh
  debris look ancient.
- Upload tables are **transient**: `upload_dog_breeds_*` from a successful run
  disappeared on its own within ~20s (Metabase's upload cleanup). This is why
  before/after both read 4 tables even though uploads had succeeded in between —
  a snapshot taken mid-window would have been misleading either way.

## Measured port drift (fixed): admin toggles race the next API call

**The one real bug the port had.** `should be able to use model persistence`
failed with:

```
POST /api/persist/card/98/persist -> 400
"Persisting models not enabled for database" {"database":"Writable MySQL8"}
```

Mechanism (confirmed in source, not guessed): `ModelCachingControl`'s `onChange`
awaits `persistDatabase(databaseId)` and the switch is
`checked={hasFeature(database, "persist-models-enabled")}` — it only reflects
the change once the refetched database lands. Cypress's command queue paced the
next step past it; Playwright fires back-to-back.

Fixed by gating on **the state the race corrupts** (the checked switch), not a
sleep, on all three admin toggles (`Model persistence`, `Editable tables`,
global `Disabled`). Classification: **known gotcha** — PORTING.md's "assert
`toBeEnabled()` before toggling any admin Switch" and "anchor on the change it
saves" already cover it; the port should have avoided it.

## NEW GOTCHA: a Mantine Switch whose accessible name IS its state

`ModelPersistenceConfiguration.tsx:155` renders **one** Switch with
`label={modelPersistenceEnabled ? t\`Enabled\` : t\`Disabled\`}`. So
`findByLabelText("Disabled")` names the switch *only while it is off* — the
instant the click lands, that locator matches nothing.

This is the placeholder trap with the **accessible name** playing the part of
the `value` attribute, and it has the same signature: a lazy `Locator` assigned
to a variable re-resolves and finds nothing, burning the action timeout. The
post-click gate must be on the **new** name:

```ts
const off = page.getByLabel("Disabled", { exact: true });
await expect(off).toBeEnabled();          // DelayedLoadingAndErrorWrapper
await off.click({ force: true });
await expect(page.getByLabel("Enabled", { exact: true })).toBeChecked();
```

Suggest adding to PORTING.md alongside the placeholder-trap entry.

## Mutation testing

Five mutants. All invert **inputs**, never expectations. Shared constants were
avoided as targets except where the assertions provably do not move with them
(the assertions here are about *outcomes* — connected / succeeded / status
codes — not about the credential values).

| # | mutation | result | died where |
|---|---|---|---|
| A | main connection updated with the **valid** writable credential instead of `READ_ONLY_USER` | **5 killed**, 4 survive | every one at its **failure-path** assertion: transform-not-failed, action 200, persistence-not-error, table-edit 200, upload 200 |
| B | `DEFAULT_USER.password` → wrong | **7 killed**, 2 survive | all 7 at `createWritableConnection`'s navigation gate |
| C | writable connection created with `READ_ONLY_USER` (connects, cannot write) | **6 killed**, 3 survive | every one at its **success tail**: transform-succeeded, job-succeeded, action <400, persisted, table-edit <400, upload <400 |
| D | the "invalid" credentials in the validation test made **valid** | **1 killed** | the alert text assertion |
| E | `dropUser` targets a **different, nonexistent** user | **1 killed** | `"Could not connect"` — received `"Connected"` |

**Coverage:** every one of the 9 tests is killed by at least one mutant.

**Why C exists — and it is the important one.** Mutant B killed 7 tests but
*all at the first gate*, leaving the success tails unproven. C was aimed
specifically at those tails and killed 6/6 at the tail assertion. Without it
the "green" on transforms/actions/persistence/table-editing/uploads would have
been unproven. This is exactly PORTING.md's "if every mutant dies at the FIRST
assertion, later assertions stay unproven".

**Surviving mutants, all explained (none indicate vacuity):**
- A's 4 survivors are the 4 tests with no failure-path assertion.
- B's 2 survivors use their own hardcoded credentials (`"invalid"`) or
  `READ_ONLY_USER`, so the mutation does not reach them.
- C's 3 survivors: the CRUD test never asserts writability; the validation test
  uses its own credentials; the health test **already** used `READ_ONLY_USER`,
  so C was a no-op for it — an honest "mutation didn't apply", not a result.

**Useful side-finding from D.** With valid credentials the save succeeds and
navigates back to `/admin/databases/2`, where a *different* alert lives
("Database routing can't be enabled if model actions are enabled."). So
`getByRole("alert")` has count 1 in **both** states — the `toHaveCount(1)` guard
does not discriminate, the **text** assertion does. Worth knowing before anyone
"simplifies" that assertion to a presence check.

**Bad mutation I initially considered and rejected:** mutating `WRITABLE_DB_ID`.
It is a shared constant and every assertion moves with it — it would have proved
nothing. Also rejected *removing* the `dropUser` call in favour of *retargeting*
it (E), per the brief's "removing a value the app persists is not a reliable
inversion".

**Tooling error I made and caught:** my first dead-import checker used a greedy
regex that swallowed the file body and reported all 35 imports — including
`test` — as dead. Corrected; the real answer is **zero dead imports** in both
files.

## Faithfulness notes

- `expectFailure`/`expectSuccess` are ported as bare `>= 400` / `< 400` status
  assertions. These are **weak but faithful** — they pin neither a status nor a
  message. **Recorded, not strengthened**, per the hard rule. Mutants A and C
  confirm they are still load-bearing.
- **Two deliberate strengthenings, both called out:**
  1. `resyncDatabase` is passed `tables: [ORDERS_TABLE_NAME]` where upstream
     uses the bare form — per the brief, the bare wait is satisfied instantly by
     a stale `initial_sync_status: "complete"` row, which is exactly this
     situation (the table is created seconds earlier).
  2. Submits assert `toBeEnabled()` before clicking, so a Formik dirty-tracking
     regression fails at the button instead of 30s later downstream.
- No test dropped, merged or weakened. No `test.fixme`.
- `fill()` is not used anywhere on the connection form: `DatabaseFormFooter`
  renders the submit as `disabled={!isDirty}`, the exact Formik gate the brief
  warned about. Click + `clear` + `pressSequentially` + blur throughout.
- Upstream registers **no** intercepts and awaits nothing, so there is no
  `cy.wait` queue to port and no `ResponseRecorder` here.
- Stub rule: not applicable — this spec mocks nothing. The connection-failure
  test drives a **real** failed connection, so the empty-body `statusCode: 500`
  rule never comes up.

## What I could NOT verify / ruled out

- **No Cypress cross-check was run** — the standing rule forbids it (it would
  break live sibling slots). I therefore **cannot** say whether upstream behaves
  identically, and am not implying I checked.
- Jar verified **by identity**, not by `JAR_PATH`: `/api/session/properties`
  reports `version.hash = 751c2a9`, matching `target/uberjar/COMMIT-ID`
  `751c2a98`.
- The `blank.sql` corruption is irrelevant here — this spec only ever restores
  `mysql-writable`.
- The 1280×720 harness viewport defect did not bite: no failure in this port was
  layout- or fold-dependent. `enableTableEditing` does scroll, but via
  `scrollIntoViewIfNeeded`, not a viewport assumption.
- **Unexplained, recorded rather than rationalised:** the container clock offset
  (~7h behind host) and the unreliable `information_schema` `create_time`. I know
  the *symptom* and worked around it by attributing debris via table contents;
  I did not chase the root cause.

## Checks

- `bunx tsc --noEmit` → clean.
- Dead imports → none (checked by hand; `tsc` does not catch them).
- No debug code, no bare `waitForTimeout`.
- Shipped spec differs from the locally-verified variant by **exactly the token
  string** (2 lines, verified by `diff`).
- Source Cypress spec **untouched** — `git status --porcelain` on it is empty,
  md5 `9a1fb9884521dad2d3019e19bd353988`.
- Own `test-results-*` cleaned; siblings' left alone. Nothing committed. No
  shared support module, `PORTED.txt`, `QUEUE.md` or `playwright.config.ts`
  touched.

---

## CI-red diagnosis (2026-07-22, workers=2 contention)

Investigated the standing red on shard 19 across runs 29814216890 (`20965df504`),
29820641912 (`5cc681aa59`), 29825096184 (`f39d02a13d`) — different subsets of the
9 tests, both attempts, each run.

### The cited red is TWO distinct issues; the first is already fixed on HEAD

**Issue 1 — `beforeEach` resync hang (FIXED after those runs).**
All three cited runs failed with `Test timeout of 90000ms exceeded while running
"beforeEach" hook`, the disposed-context tail resolving to `resyncDatabase`
(`schema-viewer.ts:198`) called from `setupTableData` → `beforeEach:213`. Root
cause: the `mysql-writable` snapshot bakes an overdue Quartz `metadata_sync`
trigger; a background sync fires on restore and either wipes db 2 or dedupes the
spec's explicit `POST /sync_schema` (`with-duplicate-ops-prevented`), so
`GET /api/database/2/metadata` polled `tables: []` forever. This is exactly the
class fixed by:
  - `5cc681aa597` — `resyncDatabase` retrigger + a 75s self-reporting budget
    inside the 90s test timeout, and
  - `15c0f7f7548` — `restore()` now PUTs db 2's `metadata_sync`/`cache_field_values`
    to a daily-3am schedule, removing the Quartz actor.
Both commits land AFTER all three cited runs. Verified fixed on current HEAD:
`--workers=1` is **9/9 green, and 27/27 under `--repeat-each=3`** — the resync
path runs in every `beforeEach` and never hangs.

**Issue 2 — global MySQL `readonly_user` collision (STILL PRESENT at workers=2, PARKED).**
With the resync hang fixed, `--workers=2 --fully-parallel` (slots 2+3, one shared
MySQL container) is still consistently red, 2–3 of 9 tests each run, a *different
subset* each time — the exact CI signature. Failures are all test-body navigation
gates that follow a connection save with `READ_ONLY_USER`:
`updateWritableConnection` / `updateMainConnection` → the section never returns
visible (`database-writable-connection.ts:154` / `:171`, 10s `toBeVisible`
timeout), because saving a main/writable connection whose credentials point at a
just-vanished account fails validation and never navigates back.

Local repro matrix (this HEAD, JAR `751c2a9`, PW_SLOT_OFFSET=2, feature token):
| mode | result |
|---|---|
| workers=1 ×1 | 9 passed |
| workers=1 ×3 (`--repeat-each=3`) | 27 passed |
| workers=2 ×1 | 3 failed (#258, #313, #382) |
| workers=2 ×1 | 2 failed (#222, #313) |

**Shared resource, identified precisely:** the `readonly_user` MySQL account.
`createUser`/`dropUser` (spec `433`/`440`) run `CREATE USER` / `DROP USER
readonly_user` — a **server-global** object, NOT scoped to the per-worker
`writable_db_w<slot>` database that `#157` isolates. Both workers share one MySQL
server (:3304), so worker A's `afterEach` `DROP USER readonly_user` pulls the
account out from under worker B's running test (and the concurrent
`CREATE`/`GRANT` interleave). The tables (`ORDERS`, `transform_table`) are NOT the
culprit — they live in the per-worker warehouse database and are already isolated.

**Proof (diagnostic, reverted):** suffixing the account name per slot
(`readonly_user_w${slot}`, the same slot arithmetic as `writableDbName()`) makes
workers=2 go **9 passed ×3 consecutive**. That is the whole fix, and it is a
one-constant change confined to this spec (the username flows through
`READ_ONLY_USER` into both the SQL and the form).

### Classification: (b) shared-resource contention → PARKED

Per the current single-thread-correctness-first prioritisation, this workers=2-only
contention is parked, not fixed — **no behavioral change made**. When workers=2
correctness is picked up, the fix is to make `READ_ONLY_USER.username` per-slot
(mirroring the `writable_db_w<slot>` isolation `#157` already applies to the
warehouse database). No assertion was weakened; the diagnostic token/user edits
used to reproduce were reverted (`git checkout`), tree clean for this spec.
