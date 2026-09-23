# workspace-instance

Port of `e2e/test/scenarios/workspaces/workspace-instance.cy.spec.ts` (287 lines)
→ `tests/workspace-instance.spec.ts` + `support/workspace-instance.ts` (new module).

Slot 3, port 4103.

## 3-line summary

**Complete port, fully verified: 2/2 upstream tests ported (postgres + mysql arms),
2 executed / 0 skipped with the QA-DB gate ON, 0 executed / 2 skipped with it OFF,
`--repeat-each=3` 6/6 green, `tsc --noEmit` clean.**
The `:workspaces` token gate is a **hard gate** and both arms of the control were
run: **402 without the feature, 200 with it** — and the FE agrees with the BE here.
Four of five mutations were killed (the survivor was **my own bad mutation** — I
inverted an input that does not feed the assertions), and two of the kills
independently prove the *product behaviour* under test: the transform's physical
table exists **only** under the workspace schema/db, never at the canonical path.

## Collision checks

| check | result |
|---|---|
| `grep -rl "workspace-instance" tests/ support/` | **no matches** — no prior port of this source |
| `ls tests/ \| grep workspace` | none |
| `ls support/ \| grep workspace` | none |
| `workspace-manager` (also queued) | **not ported yet** — no collision |

**Support module name is `support/workspace-instance.ts`** — i.e. exactly the
expected name, no deviation to flag.

Deliberate scope boundary: `e2e/support/helpers/e2e-workspace-helpers.ts` also
contains `NewWorkspaceModal`, `RenameWorkspaceModal`, `DeleteWorkspaceModal` and
the `WorkspaceListPage` members that drive them (`newButton`, `workspaceList`,
`workspace`, `workspaceMenuButton`, `renameMenuItem`, `downloadConfigMenuItem`,
`deleteMenuItem`). Those belong to `workspace-manager`. I did **not** port them —
that port should own its own surface, and porting them here would have left
unused exports in a shared-ish module.

I edited **no** shared support module, did not touch PORTED.txt / QUEUE.md /
playwright.config.ts, did not commit, and never touched port 4000.
(`git status` shows `PORTING.md`, `QUEUE.md` and `actions-in-object-detail-view.*`
dirty — those are **another slot's** work, untouched by me. My only files are
`support/workspace-instance.ts` and `tests/workspace-instance.spec.ts`.)

## The token predicate, how I traced it, and which arms I ran

### The predicate

`H.activateToken("bleeding-edge")` in both `beforeEach`. Traced from the route
mount, not from the tag:

```
enterprise/.../api_routes/routes.clj:153
  "/workspace-instance"  (premium-handler metabase-enterprise.workspaces.api/instance-routes :workspaces)

routes.clj:84  (defn- premium-handler [handler required-feature]
                 (->> handler (ee.api/+require-premium-feature required-feature ...)))

src/metabase/premium_features/settings.clj:379
  (define-premium-feature enable-workspaces?
    "Should we allow users to manage workspaces?"
    :workspaces)
```

`define-premium-feature` with **no** `:getter` override, so it is the plain
`default-premium-feature-getter` — there is **no** `(or (not is-hosted?) …)`
short-circuit (contrast `query-transforms-enabled?`, #106), **no** split by
argument (contrast MBQL/SQL vs python, #136), and the whole `/api/ee/
workspace-instance` route group hangs off it. This is the **hard gate** shape
(`writable_connection` / `:library` / `sandboxes` family, #124/#152).

### BE and FE agree here

Unlike the `transforms-permissions` case (enforcement ungated, editor UI gated),
the frontend gate matches the backend one:

```
enterprise/frontend/src/metabase-enterprise/workspaces/index.ts
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.getDataStudioRoutes = getDataStudioRoutes;   // ← the /data-studio/workspaces routes
    ...
  }
```

The OSS default (`frontend/src/metabase/plugins/oss/workspaces.ts`) returns
`getDataStudioRoutes: () => null`. So without the token the pages this spec
drives do not exist at all, *and* the API returns 402. The token is load-bearing
on both sides — not a red herring (#155), not a dead tag.

### The two-arm control — I ran BOTH arms

Run directly against my slot-3 backend (`:4103`), admin session, no token values
printed:

| arm | `token-features.workspaces` | `GET /api/ee/workspace-instance/current` | `DELETE …/current` |
|---|---|---|---|
| **A — without** (pre-existing token, 42 features ON, `workspaces: false`) | `False` | **402** | — |
| **B — with** (`bleeding-edge` = `MB_ALL_FEATURES_TOKEN`, 53 features ON) | `True` | **200** | **204** |

`PUT /api/setting/premium-embedding-token` → **204**, i.e. the token activates
cleanly — the `.env`-trailing-comma folklore is indeed not in play, consistent
with the retraction in the brief.

This proves both halves of what the control is for: **the gate is real** (402 in
arm A) **and the token lifts it** (200/204 in arm B). Arm A additionally rules
out the "flag false but gating nothing" shape — the route genuinely 402s.

I did **not** additionally remove `activateToken` and re-run the whole spec,
because the API-level arm A already produced the 402 that a spec-level removal
would only reproduce more slowly and less precisely.

## Gate mapping, with the gate-OFF control

Two independent gates, and they are independent of each other:

| gate | what it decides | mechanism |
|---|---|---|
| **container gate** (`PW_QA_DB_ENABLED`) | whether the tests run at all | `test.skip()` at the top-level describe |
| **token gate** (`:workspaces`) | whether the feature works inside them | `mb.api.activateToken("bleeding-edge")` in each `beforeEach` |

I read the `beforeEach` rather than trusting a tag. Upstream restores
`postgres-writable` / `mysql-writable`, activates the token, resets the source
test table, provisions the output schema/database in the **warehouse**, and
resyncs — i.e. the setup is genuinely `@external` on **both** arms (the mysql arm
is not merely tagged so).

| run | executed | skipped |
|---|---|---|
| `PW_QA_DB_ENABLED=1` (gate ON) | **2** | 0 |
| gate OFF (control) | **0** | **2** |

The difference is exactly the two gated tests — the whole spec is behind the
container gate, so there is nothing that should have run in the OFF arm and
didn't, and nothing that ran in both.

## "4.4 seconds" — flagged as suspicious, then ruled out

The first green run reported 4.4s per test, which looked like the FINDINGS #49
"green run that never executed" shape, so I did not accept it. Ruled out three ways:

1. `POST /api/testing/restore/postgres-writable` against the **already-warm**
   slot-3 backend measured **0.103s** — the writable snapshots are small, and the
   harness's post-restore search-index poll exits on the first successful probe.
2. Mutations M1/M1b/M3/M4 all die on **real warehouse and DOM state** produced
   inside the test (see below) — impossible if the body had not executed.
3. `resyncDatabase(api, {dbId})` with no `tables` list returns on the first poll
   where metadata has any tables, which is fast. This mirrors the upstream call
   shape (`H.resyncDatabase({ dbId })`, also with no table list); the transform's
   target table is picked up by the sync the transform run itself triggers, which
   the mini-picker step then proves by finding "Transform Table".

## Mutation testing

Mutator: `scratchpad/s3-mutate.py`. **Verifier design** — everything that can
abort is checked **in memory before the write**, so an abort can never leave a
half-mutated file on disk (the exact failure the brief warns about: a false-abort
*after* the write, which would make a mutated file read as clean). After writing,
the file is read back and compared **byte-for-byte to the intended content**, not
by a substring heuristic (which would be wrong whenever the replacement text
occurs naturally elsewhere).

**I sanity-checked the checker**, four ways, and confirmed the file's md5 was
unchanged afterwards:

| checker test | expected | actual |
|---|---|---|
| anchor absent | abort, file untouched | `ABORT (pre-write): anchor occurs 0 times` |
| anchor occurs 8× | abort, file untouched | `ABORT (pre-write): anchor occurs 8 times` |
| no-op mutation | abort | `ABORT (pre-write): mutation is a no-op` |
| real unique anchor | land + verify | `OK`, and `grep` confirmed the new value on disk |

Every mutation below reported `OK: mutation landed and verified`, and each was
additionally eyeballed on disk with `grep`/`sed` before running.

| # | mutation (input inverted) | outcome | where it died |
|---|---|---|---|
| **M1** | postgres transform writes `rowCount: 2` instead of `ROW_COUNT` (3) | **killed** | first `assertQueryBuilderRowCount` after the native query — `unexpected value "Showing 2 rows"` |
| **M1b** | postgres raw-warehouse `COUNT(*)` aimed at the **non-remapped** path `"Domestic"."transform_table"` | **killed** | the tail assertion — `relation "Domestic.transform_table" does not exist` |
| **M2** | postgres config `input_schemas: [POSTGRES_INPUT_SCHEMA]` → `[]` | **SURVIVED — my bad mutation** | n/a (see below) |
| **M3** | postgres config `output.schema` → `"Wild"` instead of `mb__isolation` | **killed** | the **second** remapping assertion (spec:222), with the first still passing |
| **M4** | mysql raw-warehouse `COUNT(*)` aimed at the non-remapped path `` `transform_table` `` | **killed** | the mysql tail assertion — `Table 'writable_db.transform_table' doesn't exist` |
| **M5** | mysql arm: drop `LeaveWorkspaceModal.confirmButton().click()` | **killed** | the final assertion — `setupInstanceButton` never appears |

### Aiming at the tails

M1 was **partially blunt**: it killed the *earliest* of three row-count
assertions. I aimed a follow-up (M1b) at the tail — the raw-warehouse
`COUNT(*)` — and it died there. M3 was aimed specifically at the *second*
remapping assertion and died exactly there, with the first visibly passing in the
received string:

```
"Writable Postgres12TableMapped tableMapping created at
 Domestic/transform_table Wild/Domestic__transform_table July 20, 2026, 5:36 AM"
```

M5 covers the final leave-workspace assertion, which no data mutation reaches.
So every distinct assertion group in the spec has at least one mutation that dies
*at it*.

### The survivor: M2 was a bad mutation, and I am calling it out

M2 assumed `input_schemas` controls whether a transform target gets remapped. It
does not. Presence probe on the backend:

- `enterprise/.../workspaces/config.clj:34` — `input_schemas` is joined into
  `:schema-filters-patterns` (or `:dataset-filters-patterns` / `:db-filters-patterns`),
  i.e. it scopes **sync visibility** on the workspace's cloned connection.
- `enterprise/.../workspaces/provisioning.clj:113` — it is passed to `grant!`,
  i.e. it scopes **warehouse GRANTs**.

Neither is an input to the remapping the assertions observe. So this is
**"the data cannot discriminate"**, *not* a vacuous assertion — and the
distinction is settled independently by M3, which inverts the input that *does*
feed the remapping row and kills the assertion cleanly. Same conclusion for the
physical side from M1b/M4.

Incidentally the survival is itself informative: `input_schemas: []` does not
disable remapping, which is consistent with upstream's own mysql fixture passing
`input_schemas: []` (MySQL has no schemas; `config.clj` documents that no-schema
engines emit `{}` and are scoped by `:details.db` instead).

### What the kills prove about the product, not just the port

M1b and M4 are the strongest results here. On **both** engines the canonical path
does **not** exist in the warehouse —

- postgres: `"Domestic"."transform_table"` → `relation … does not exist`
- mysql: `` `writable_db`.`transform_table` `` → `Table … doesn't exist`

— while the workspace-qualified path holds exactly `ROW_COUNT` rows. So the
remapping is real isolation, not a display-layer rename, and the spec's
native/MBQL row-count assertions are genuinely testing query rewriting.

## Weak-but-faithful assertion, recorded not strengthened

Upstream's **mysql** remapping check is weaker than its postgres counterpart:

```js
H.CurrentWorkspacePage.database(MYSQL_DB_NAME)
  .should("contain.text", MYSQL_TARGET_TABLE)                       // "transform_table"
  .and("contain.text", `${MYSQL_OUTPUT_DATABASE}/__${MYSQL_TARGET_TABLE}`);
```

`"mb__isolation/__transform_table".includes("transform_table")` is **true**
(verified mechanically), so the **first assertion cannot fail unless the second
also fails** — it is fully subsumed. The postgres arm does not have this problem
because it asserts the fully-qualified from-side (`Domestic/transform_table`).
The mysql arm presumably avoided hardcoding `writable_db/transform_table`.

Per the hard rules this is **recorded, not strengthened**: ported verbatim as two
separate `toContainText` calls, with the analysis inline in the spec header.

## Assertion-semantics decisions

- `should("contain.text", x)` on a **single** element is a **concatenation**
  assertion → `toContainText(x)` on the same region locator, one `expect` per
  upstream `.should`/`.and`. No `.first()` anywhere, so neither the ANY-OF nor
  the concatenation trap applies.
- **Whitespace normalisation banked, not waved away**: Playwright's
  `toContainText` normalises whitespace and Cypress's `contain.text` does not.
  I checked the mechanism rather than just not seeing a failure — every needle
  here (`Domestic/transform_table`, `mb__isolation/Domestic__transform_table`,
  `mb__isolation/__transform_table`, `transform_table`) contains **no
  whitespace**, and normalisation only *collapses runs*, never deletes
  characters, so it can produce neither a false positive nor a false negative
  for these needles. Confirmed empirically by M3's received string, which shows
  the region's text rendering with the qualified names intact.
- No `not.exist` / absence assertions in this spec, so no `toHaveCount(0)`
  question arises.
- No toasts, so the `UndoListing.tsx:203` strict-mode trap does not apply
  (checked: neither the workspace pages nor the leave flow raise an undo toast —
  `DeleteSection` uses `useConfirmation`, a modal, not a toast).
- `expect(CurrentWorkspacePage.get(page)).toBeVisible()` is on the page's
  `PageContainer` (`data-testid="current-workspace-page"`), a real content
  element gated behind `DelayedLoadingAndErrorWrapper` — **not** an empty-state
  component, so it is a valid anchor. The `TableRemappingSection` empty state
  ("Tables will be remapped here the first time…") renders only *after* the
  queries resolve, and nothing anchors on it.
- The Mantine `Modal` root is only ever used as a scope for `getByRole("button")`
  clicks, never asserted on directly, so the "modal reports hidden while open"
  trap does not bite.
- No `cy.wait("@alias")` queue in the source and no `cy.intercept` at all — the
  spec awaits nothing, so there was no queue to port.
- No fixture ids or field names were guessed: `WRITABLE_DB_ID = 2` and the
  writable DB display names (`Writable Postgres12` / `Writable MySQL8`) were read
  from `e2e/support/cypress_data.js` and `e2e/snapshot-creators/qa-db.cy.snap.js`.

## Port mechanics worth noting

- `H.SetupWorkspaceModal.uploadConfig` used `cy.selectFile(Cypress.Buffer.from(yaml.dump(config)), {force:true})`
  → `setInputFiles({name, mimeType, buffer})`. Playwright drives hidden file
  inputs natively, which is what upstream's `{force:true}` existed for.
  `js-yaml` is not a dependency of this package; like the `pg`/`knex`/`mysql2`
  drivers it is `require`d **lazily** from repo-root `node_modules`, so the
  module still loads when the QA-DB gate is off.
- `AdvancedConfig` is a local structural type (the package does not import
  `metabase-types`), kept as narrow as the upstream fixtures so a typo in a
  fixture is still a type error.
- `MetabaseApi` has `get`/`post`/`put` but no `delete`, so
  `clearWorkspaceInstanceConfig` goes through `api.fetch("DELETE", …)` — same
  status-code enforcement.
- Upstream's `H.getTableId({ schema: sourceSchema ?? undefined })` collapses a
  null schema to "no schema filter"; the ported `getTableId` skips the filter
  when `schema` is absent, so the mysql arm (which passes `null`) matches on name
  alone exactly as upstream does.
- Upstream `cy.log(...)` breadcrumbs preserved as comments in the same positions.
- No fixtures were created, so the "name your fixtures distinctively" hazard did
  not arise — `mb__isolation` is **upstream's own literal**, not something I
  invented, and it is dropped in `afterEach` on both engines.

## No fixmes

Every upstream `it` is ported and executes. Nothing was dropped, weakened,
merged, or `fixme`'d.

## tsc / dead imports

- `bunx tsc --noEmit` → **clean** (exit 0), run from `e2e-playwright/`, never
  from the repo root.
- `tsc` does not catch dead imports, so I checked by hand with a script — **no
  dead imports** in either file. **I sanity-checked that checker** by injecting a
  known-unused import (`createNativeModel`); it was correctly reported as DEAD,
  then reverted (md5 back to baseline).

## Shared state, before and after

| resource | before | after |
|---|---|---|
| writable postgres `mb__isolation` schema | absent | **absent** (dropped in `afterEach`) |
| writable postgres `Domestic` / `Wild` schemas | present | present (rebuilt by `resetTestTableMultiSchema` in `beforeEach`, same as upstream and several sibling ports) |
| writable postgres transform tables | `Schema A.transform_table` | `Schema A.transform_table` — **not mine**; pre-existing residue from a sibling's `transforms.spec.ts`, deliberately left alone |
| writable mysql `mb__isolation` database | absent | **absent** (dropped in `afterEach`) |
| writable mysql transform tables | none | **none** |
| slot-3 backend workspace instance | none | **none** (`GET …/current` → `{"data":null}`) |
| slot-3 backend token | a token with 42 features | `bleeding-edge` (53 features) |

Two mutation runs leaked a table by design and **both were cleaned explicitly**:
M3 left `"Wild"."Domestic__transform_table"` (dropped, verified by re-querying
`information_schema`); M2's leak did not occur because remapping still happened.

The one deliberate residue is the **token**: I activated `bleeding-edge` on the
slot-3 backend during the manual arm-B probe, and it is still active. This is
benign and self-correcting — every test's `beforeEach` restores a snapshot and
re-activates the same token, so the backend ends in exactly the state any run of
this spec leaves it in. Flagging it because it is a change I made outside the
test body. **No token values were printed at any point.**

## Environment / what I ruled out

- **Jar verified by identity**, not `JAR_PATH`: the running JVM is
  `java -jar …/target/uberjar/metabase.jar`, and that jar's `version.properties`
  reports `hash=751c2a9`, matching `COMMIT-ID 751c2a98`. (The harness printed
  `(reused)` for the slot-3 backend, exactly as the brief predicted — hence
  checking identity rather than the env var.)
- **No Cypress cross-check was run** (standing rule). I therefore **cannot** say
  whether upstream also passes, and make no claim either way.
- The `blank.sql` corruption, the 30-day `default`-snapshot fuse, the
  `schemas[0] == "Domestic"` box quirk and the postgres heap-order hazard are all
  **inapplicable by mechanism, not by absence of symptoms**: this spec restores
  only `postgres-writable` / `mysql-writable` (never `blank` or `default`), and
  asserts no ordering — the only ordered thing it reads is a single remapping
  row.
- The 1280×720-vs-800 harness viewport did not come up; nothing here is
  layout-dependent.
- **Nothing is unexplained.** The one surprise (M2 surviving) was traced to a
  concrete backend mechanism rather than hand-waved, and the one initially
  suspicious observation (4.4s runtimes) was measured rather than assumed.
