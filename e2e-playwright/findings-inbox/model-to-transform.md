# model-to-transform (slot 2, port 4102)

Source: `e2e/test/scenarios/data-studio/data-model/model-to-transform.cy.spec.ts` (406 lines, 7 tests)
Target: `e2e-playwright/tests/model-to-transform.spec.ts`
Support: **`support/model-to-transform.ts`** — the expected name; no deviation.

## Collision checks

- `grep -rl "model-to-transform" tests/ support/` → **no hits** before writing. No
  uncommitted port of this source exists.
- `ls tests/` → no `model-to-transform.spec.ts`.
- Source-directory basename check: `e2e/test/scenarios/data-studio/data-model/` has
  exactly one `model-to-transform.cy.spec.ts` (no `.js`/`.ts` twin).
- Siblings read before writing so as not to collide or duplicate:
  `tests/transforms-inspect.spec.ts`, `tests/datamodel-data-studio.spec.ts`,
  `tests/data-model-shared-1..4.spec.ts`, `support/data-model.ts`,
  `support/transforms-inspect.ts`, `support/schema-viewer.ts`.
  **No shared support module was edited.**

## What the `beforeEach` actually restores (probe, not tag)

```
dropAllTestTables()             → DDL on the writable QA Postgres
H.restore("postgres-writable")
cy.signInAsAdmin()
H.activateToken("bleeding-edge")
cy.intercept(POST /api/ee/replacement/replace-model-with-transform)
```

The `@external` tag is **accurate** here (unusual — cf. #123's ~20 untagged
writable-snapshot specs). Verified at runtime on :4102 rather than inferred:

| snapshot | db 2 name | `details.dbname` | host:port |
|---|---|---|---|
| before (`postgres-12`, left by a prior run) | QA Postgres12 | `sample` | localhost:5404 |
| after `restore/postgres-writable` | **Writable Postgres12** | **`writable_db`** | localhost:5404 |

So under **this** snapshot `WRITABLE_DB_ID` (literal `2`) genuinely IS the
writable container — the opposite of the `postgres-12` red herring recorded in
PORTING. Checked on `name`/`details.dbname`, as instructed.

## Gate mapping + the gate-OFF control

Gate: `test.skip(!process.env.PW_QA_DB_ENABLED, …)` in the `beforeEach`, plus a
token guard (below). Both live in the `beforeEach`, and there is no `afterEach`,
so the #1509 "afterEach fails every test in a gate-OFF control" trap does not
apply here.

- **Gate ON** (`PW_QA_DB_ENABLED=1`): **7 executed, 7 passed, 0 skipped.**
- **Gate OFF** (env var unset): **0 executed, 7 skipped, 0 passed, 0 failed.**

The difference is exactly the 7 gated tests — i.e. the whole file, which matches
the tag propagating from the sole top-level describe.

## Token predicate — traced on BOTH sides, and it is REAL

Upstream calls `H.activateToken("bleeding-edge")` → `MB_ALL_FEATURES_TOKEN`.
The queue's `token` gate is correct here, but for a predicate that is **not**
the one the sibling transforms specs traced.

- **Backend.** `enterprise/backend/src/metabase_enterprise/api_routes/routes.clj:127`
  `"/replacement" (premium-handler metabase-enterprise.replacement.api/routes :dependencies)`
  → every `/api/ee/replacement/*` route is behind `:dependencies`. No
  `(not is-hosted?)` escape hatch anywhere on this path.
- **Frontend.** `enterprise/frontend/src/metabase-enterprise/replacement/index.ts:12`
  `if (hasPremiumFeature("dependencies")) { … PLUGIN_REPLACEMENT.getTransformToolsRoutes = … }`
  → without the feature the `/data-studio/transforms/tools/migrate-models`
  **route is never registered**, so the page cannot even be reached.

So BE and FE agree here — unlike the `transforms-basic` case where they
disagreed. Measured on the slot backend (values never printed):

| state | `token-features` ON | `dependencies` |
|---|---|---|
| after a bare `restore/postgres-writable` | 0 | `false` |
| after activating `bleeding-edge` (PUT → **204**) | 53 | `true` |
| (prior session leftover, `pro-self-hosted`) | 42 | `true` |

`MB_ALL_FEATURES_TOKEN` in `cypress.env.json` is **64 chars and activates 204** —
confirming the retraction (#129): the `.env` trailing-comma advice does not apply,
`support/env.ts` reads `cypress.env.json`, and the tokens there are clean.
`transforms-basic` and `writable_connection` are both `true` under bleeding-edge,
so neither of the two known "absent feature" hazards bites this spec.

Because `dependencies` is genuinely required and `pro-self-hosted` also carries
it, there is no unlicensed arm to assert against; the port gates on
`resolveToken("bleeding-edge")` rather than pretending an OSS path exists.

## FINDING — the one real run-1 failure: the dependency graph is built ASYNCHRONOUSLY

Run 1: 6/7. "keeps a dashboard with a parameter filter working after conversion"
failed at the last assertion — `data-step-cell` read **"Dashboard model"**
(i.e. still the card) instead of "Mtt Output Table". It **passed in isolation**,
which is the classic "don't write it off as flake" shape.

Mechanism, traced in the backend rather than guessed:

- `replacement.runner/run-swap*` operates on `all-transitive-dependents`, which
  comes from `replacement.usages/transitive-usages` →
  `metabase-enterprise.dependencies.models.dependency/transitive-dependents` —
  i.e. **the persisted dependency graph**.
- That graph is **not** written on card save. `dependencies/events.clj:22-38`:
  card create/update only `mark-stale!` + `trigger-backfill-job!`, with the
  comment *"Create/update handlers mark entities stale in dependency_status.
  The backfill task does the actual computation."*
- Therefore a conversion that outruns the backfill sees **no dependents**,
  rewrites nothing, and the replacement run still reports **`succeeded`** — so
  `waitForReplacementToComplete` is satisfied and the damage surfaces three
  steps later at an unrelated-looking assertion.

Cypress never hit it: its command queue puts seconds between the fixture
`POST /api/card` and the UI flow. This is a **pacing difference, not a product
bug** — and note it is *not* something a `waitForResponse` or a retrying
assertion could have rescued, because the rewrite never happens at all.

Fix: `waitForDependencyBackfill(api)` polls the product's own readiness endpoint
`GET /api/ee/dependencies/backfill-status` → `{complete: boolean}`
(`dependencies/api.clj:1047`, *"complete is true when there are no stale or
outdated entities awaiting processing"*) before every conversion. A **wait**,
not an assertion — nothing about what the spec tests changed.

**Generalisable**: any port that mutates cards and then exercises a surface
reading the dependency graph (dependency-graph, dependency-broken-list,
dependency-unreferenced-list, source-replacement, and the rest of the
replacement tier) has this hole. Worth a sweep — `backfill-status` is the
cheap, product-supplied gate.

## Second port-required wait: MigrateModelsPage reads the SEARCH INDEX

`MigrateModelsPage` lists models from
`useSearchQuery({ models: ["dataset"], context: "model-migration" })`, and
RTK-Query fetches once per mount then serves the cache — so a read that races
the indexer yields a permanently empty table that no assertion retry can fix.
`waitForModelInSearch(api, name)` polls
`/api/search?models=dataset&context=model-migration` for the model's name before
navigating. Same class as the standing PORTING rule; recorded because this spec
creates the model by API microseconds before reading it.

## Other port decisions worth recording

- **`H.resyncDatabase({ dbId })` bare form ×2** — both call sites here
  immediately look a *newly created* table up by id, so this is the case where
  the bare form's "gates on nothing" hole genuinely bites. Ported with
  `tables: [SOURCE_TABLE]` / `tables: [OUTPUT_TABLE_SLUG]`. The refined
  stale-`initial_sync_status` caveat does not apply: the `postgres-writable`
  snapshot carries no rows for `mtt_*`.
- **The `cy.intercept` alias is awaited exactly once per conversion**, after the
  submit click. No response QUEUE was needed (unlike `model-actions`): exactly
  one POST to that endpoint happens per conversion and nothing relies on a
  retroactive match. The `waitForResponse` promise is created before the click
  (rule 2).
- **Schema pinned in table lookups** (`schema: "public"`) — this names the schema
  upstream's *unqualified* DDL already targets; it is not a behaviour change. It
  matters because the shared container has 29 schemas (below).
- **`findByLabelText("Table name")` → `getByLabel(…, { exact: true })`** —
  `findByLabelText` is exact, `getByLabel` is a substring match.
- **`clear().type()` → `click()` + `fill("")` + `pressSequentially()`** — the
  field is a Formik-controlled input whose sibling `useEffect` keeps re-deriving
  it from the model name until `TargetNameInput`'s `isDirtyRef` flips on the
  first real `onChange`, so per-character change events are the faithful shape.
- **Vacuous-looking upstream assertion kept verbatim, with the analysis inline**:
  `expect(($input.val() as string).length).to.be.greaterThan(0)` — upstream's own
  comment says *"Unjustified type cast. FIXME"*. It only asserts the prefilled
  table name is non-empty. Ported as `expect.poll(inputValue().length)
  .toBeGreaterThan(0)`; **not strengthened**.
- **`should("be.visible")` on `findAllByText(...).first()`** — upstream already
  applies `.first()`, so this is first-match, not the rule-3 any-of case;
  `.first()` is faithful.
- `assertDataSourceIs` uses `toHaveText`, which normalizes whitespace. Harmless
  here — the subject is a short humanized table name, never preformatted text —
  so no strengthening is being claimed and nothing is silently vacuous.

## Container state before / after

`docker ps`: `postgres-sample` (:5404), `mysql-sample` (:3304), `mongo-sample`,
`maildev`, `webhook-tester` up. `maildev-ssl` and localstack :4566 down — neither
is needed. Ran with `PW_QA_DB_ENABLED=1`.

**Schemas in `writable_db` before: 29** — `Domestic`, `Schema A`…`Schema Z`,
`Wild`, `public`. That is #85 contamination from sibling specs' `multi_schema` /
`many_schemas` resets; **not touched** (siblings are live).

**Tables this port creates**, enumerated before/after:
- `public.mtt_source_table` — created and dropped by the spec's own
  `dropAllTestTables()`/`createTestTables()`. Clean.
- `<schemas[0]>.mtt_output_table` — created by the *product* (the transform's
  output table), not by the spec.

⚠️ **Environment-dependent, and worth knowing before reading a failure.**
`ReplaceWithTransformModal` defaults `targetSchema` to `schemas[0]` from
`GET /api/database/2/syncable_schemas`, and upstream never touches that field.
Measured on this box the endpoint returns
`["Domestic","Schema A",…,"Wild","public"]`, so `schemas[0]` is **`Domestic`**,
not `public` — on a fresh CI container it would be `public`. Consequence:
upstream's unqualified `DROP TABLE IF EXISTS mtt_output_table` (search_path =
`public`) **cannot reach the output table on this box**. Nothing the spec
asserts depends on the schema (only on the humanized table LABEL), so the port
stays faithful and does not pick a schema. `Domestic.mtt_output_table` is
dropped by hand at the end of this session — attributed by contents, and only
that one table; no foreign schema is dropped.

## `tsc`

`bunx tsc --noEmit` from `e2e-playwright/` — **clean**, run after every edit.
Dead imports checked by hand (the checker itself is known to lie): every symbol
imported by the spec and by `support/model-to-transform.ts` is referenced.

## Mutation testing

Every mutation is an **input** inversion, never an expectation edit. Each was
applied with an anchored `str.replace` guarded by a `count == 1` assertion and
then **read back from disk** before the run was interpreted (PORTING: "verify
the mutation actually landed"). Landing is confirmed per row below.

| # | Mutation (input) | Landed? | Killed | Died at | Survived (and why that is correct) |
|---|---|---|---|---|---|
| **M1** | `createTestTables` inserts only row 1 — drop `(2, 'Source Row Beta', 200.75, 'B')`. Row values are asserted by name; the constants are untouched, so the assertion does **not** move with the fixture. | yes (read back: single INSERT row) | **1, 3, 4, 5** | 1 → `spec:169` (1st `assertSourceRowsVisible`); 3 → `spec:215` (`SOURCE_ROW_NAME_2` visible); 4 → `spec:255` (`301.25`); 5 → `spec:273` | 2, 6, 7 — none of them assert row content |
| **M2** | `OUTPUT_TABLE_SLUG` `mtt_output_table` → `mtt_other_table`. **Not** the shared-constant trap: `OUTPUT_TABLE_LABEL` ("Mtt Output Table") is an independent literal, so the created table moves and the assertion does not. | yes (`28: … "mtt_other_table"`, `29:` label unchanged) | **1, 3** | 1 → `spec:171`, 3 → `spec:229` — both `assertDataSourceIs(OUTPUT_TABLE_LABEL)`, **received "Mtt Other Table"** | 2, 4, 5, 6, 7 — they never name the output table |
| **M3** | `SOURCE_TABLE` `mtt_source_table` → `mtt_src_table` (`SOURCE_TABLE_LABEL` again independent). | yes (read back) | **2** | `spec:192`, `assertDataSourceIs(SOURCE_TABLE_LABEL)`, **received "Mtt Src Table"** | 1, 3, 4, 5, 6, 7 — everything still works end-to-end; only the label assertion moves |
| **M4a** | Test 6's model moved off the Sample DB onto `WRITABLE_DB_ID` + the writable source table, so `validateDatabase` returns valid. | yes (read back, lines 283-291) | **6** | `spec:297`, `toBeDisabled()` → **received `enabled`** | — |
| **M4b** | Test 7 signs in as **admin** instead of the normal user. | yes (read back) | **7** | `spec:313`, permission text not found | — |

**M1 was deliberately followed up.** It killed 4 tests but every one of them died
at the *first* assertion, leaving `assertDataSourceIs(OUTPUT_TABLE_LABEL)` — the
thing the spec actually exists to prove — unexercised. M2 exists solely to aim at
that tail, and it hit it in both tests, with a *received* value that shows the
assertion is reading the freshly-created output table rather than anything
incidental.

**M4a also settles a vacuity worry I had raised against my own port.**
`SourceReplacementButton` computes `isDisabled = isLoading || hasActiveRuns`, so
`toBeDisabled()` could in principle have been satisfied by the pre-load state
rather than by `validateDatabase`. It is not: under M4a the same locator reads
`enabled`. No anchor needed, and upstream's assertion is sound as written.

**Surviving mutants: none unexplained.** Every survivor above is a test that
provably does not reference the mutated input. **No mutation of mine was bad**
in the four documented senses (shared constant, shrinking both sides, removing a
persisted value, conjunction-gating) — the two constant mutations were checked
against their independent LABEL siblings before being run, which is exactly the
trap they would otherwise have fallen into.

**Coverage: all 7 tests have at least one killing mutant.**

## Spec restored byte-identical

```
before mutations:  4c0ad3855f0c72ea34849c37471692bb  tests/model-to-transform.spec.ts
                   5977a2e859b2bc8107cad73d913bf7c5  support/model-to-transform.ts
after  restore:    4c0ad3855f0c72ea34849c37471692bb  tests/model-to-transform.spec.ts
                   5977a2e859b2bc8107cad73d913bf7c5  support/model-to-transform.ts
```
md5-identical, confirmed. (Scratch copies were slot-prefixed — `s2-spec.orig.ts`,
`s2-support.orig.ts`, `s2-md5.orig.txt` — per the shared-scratchpad rule.)

One *subsequent, intentional* edit was made after the restore: the non-admin test
now navigates via the `MIGRATE_MODELS_PATH` constant instead of a duplicated
string literal, matching upstream, which uses the constant. Re-verified green.

## Container state after

`mtt_*` tables in `writable_db`: **0**. Schemas: **29** — unchanged; no foreign
schema touched. The four tables my runs left behind were dropped by hand and
attributed by contents (the `mtt_` prefix is used by exactly three files in the
repo, all of them this spec and its port — verified by grep):

| table | origin |
|---|---|
| `public.mtt_source_table` | the spec's own fixture (upstream drops it at the *start* of each test, so the last run always leaves one) |
| `Domestic.mtt_output_table` | product-created transform output; upstream's unqualified DROP cannot reach it here (see the schema note above) |
| `Domestic.mtt_other_table` | M2 |
| `public.mtt_src_table` | M3 |

## Warnings from the brief that turned out INAPPLICABLE (banked, not silently dropped)

- **`verifyAndCloseToast` strict-mode violation / `support/data-model.ts`'s owed
  fix** — this spec never touches a toast and never imports `data-model.ts`. Not
  made, not needed.
- **`visitDataModel`'s wait gate never firing under #85** — the spec never visits
  the data model, despite living in the `data-model/` directory. Its whole UI
  surface is `/data-studio/transforms/**`, the QB and a dashboard.
- **The table picker's RAW schema name (`public`, not `Public`)** — no picker is
  driven here; the only schema interaction is the modal's *defaulted* select,
  which upstream never touches.
- **CodeMirror / `{Enter}`-is-a-completion-accept / the 75ms `interactionDelay`**
  — no editor typing anywhere; the only typed field is a plain Formik text input.
- **Snowplow** — the surface *does* emit (`model_to_transforms_migration_*` via
  `analytics/track-event!` in `replacement/api.clj`, i.e. BACKEND-emitted and
  therefore invisible to browser-boundary capture), but the spec asserts nothing
  about events, so there is no capture to install and no queued-offset hazard.
- **`writable_connection` absent (#124)** — bleeding-edge carries it (`true`).
- **`transforms-basic` absent (#106)** — bleeding-edge carries it, and in any
  case it is not this surface's predicate.
- **The `.env` trailing-comma advice (#129, retracted)** — confirmed irrelevant:
  `support/env.ts` reads `cypress.env.json`, whose token is 64 chars and
  activates **204**.
- **The 1280×720 vs configured-800 harness discrepancy** — no failure here was
  layout-dependent, so nothing is attributed to it.
- **`blank.sql` corruption** — this spec restores `postgres-writable`, never
  `blank`.

## Not verified (scope caveats)

- **No Cypress cross-check was run.** Four sibling slots were live, and running
  `H.restore()` from Cypress re-points database 1 at the shared H2 file and
  wedges them. So I **cannot** say whether upstream fails the same way anywhere,
  and I make no fidelity claim resting on that. Nothing here needed it: no
  `test.fixme` was added and no product-bug claim is made.
- The `waitForDependencyBackfill` diagnosis is **read from the backend source
  plus a reproduced-then-fixed failure**, not from instrumenting the runner. I
  did not prove which specific dependent was missing in the run-1 failure, only
  that the dependent question was left pointing at the model and that gating on
  the backfill removes the failure (21/21 under `--repeat-each=3`).
- CI runs a *merge commit* jar; this was verified only against the local
  `751c2a98` uberjar.

## Summary (3 lines)

1. 7/7 execute and pass on the CI uberjar (`751c2a98`, verified by `ps` +
   `version.hash`), gate-OFF control 7 skipped; `@external` and `token` are both
   accurate and the token predicate is `:dependencies`, real on BE **and** FE.
2. The one genuine failure was the replacement runner reading an
   **asynchronously built dependency graph** — a run reports `succeeded` having
   rewritten nothing; fixed with the product's `backfill-status` endpoint, and
   the hole generalises to the whole dependency/replacement tier.
3. No shared support module edited, no upstream assertion dropped or weakened
   (the one vacuous-looking upstream check is preserved verbatim with analysis
   inline), spec restored byte-identical after mutation testing.
