# data-studio-bulk-table

Port of `e2e/test/scenarios/data-studio/data-model/data-studio-bulk-table.cy.spec.ts`
(410 lines, 7 tests) → `tests/data-studio-bulk-table.spec.ts` + `support/data-studio-bulk-table.ts`.
Slot 5 (:4105). **7/7 green; 21/21 under `--repeat-each=3`; `tsc --noEmit` clean.**

## Summary (3 lines)

1. All 7 tests execute and pass against the CI uberjar; the `@external` tag is
   accurate on all 7 and the gate-OFF control skips exactly those 7.
2. One declared deviation: in the search-view test, `Animals` is pinned to the
   `Domestic` schema — the upstream selector is ambiguous by construction
   (2 matches on a clean container, 28 in the app DB here under FINDINGS #85).
3. Four mutations, four kills, each at the intended family of assertion after
   one mis-aimed attempt was re-aimed; spec restored byte-identical (md5).

## Collision checks

- `grep -rl "data-studio-bulk-table" tests/ support/` → **no match** before the
  port. No uncommitted port of this source existed.
- Neighbouring `data-studio*` / `datamodel-*` modules (`datamodel-data-studio`,
  `data-studio-tables`, `data-studio-library`, `data-studio-metrics`,
  `data-studio-snippets`, `measures-data-studio`, `segments-data-studio`,
  `admin-datamodel*`, `data-model-shared-1..4`) were read; all are ports of
  different sources. Nothing overwritten.
- Source directory holds only `.ts` specs — no `.cy.spec.js` twin, so this is
  not one of the three known disjoint pairs.
- **Support module name is the conventional `support/data-studio-bulk-table.ts`.
  NO deviation.** Nothing else imports it; no dangling-import risk.

## Gate mapping, per describe, with the gate-OFF control

One top-level describe (`bulk table operations`) and one nested describe.

| describe | tests | tag | tag accurate? |
|---|---|---|---|
| `bulk table operations` (direct `it`s) | 5 | `@external` on each `it` | yes — all restore `postgres-writable` |
| ↳ `several databases with several schemas at once (GDGT-1275)` | 2 | `@external` on the **describe** (inherited) | yes — restores `postgres-writable` + writes `multi_schema` to the container |

7/7 tests carry the tag, which is why the queue reported `external`
unqualified. The tag is **accurate**, not drifted: every test restores
`postgres-writable`, and two write directly to `writable_db` on :5404.

**Gate-OFF control (`PW_QA_DB_ENABLED` unset):** `7 skipped`, 0 executed.
**Gate-ON:** `7 passed`, 0 skipped. The difference is exactly the 7 tagged
tests — i.e. nothing is silently non-executing. Gated on the deliberate
`PW_QA_DB_ENABLED`, never the bare `QA_DB_ENABLED` (which leaks truthy from
`cypress.env.json`).

**The `WRITABLE_DB_ID` red herring does not apply.** Verified on identity, not
on the constant: `GET /api/database` → id 2 = `{"name":"Writable Postgres12",
"engine":"postgres","dbname":"writable_db","port":5404}`. Under the
`postgres-writable` snapshot, database 2 genuinely IS the writable container.

## Token predicate — how it was traced

`H.activateToken("pro-self-hosted")`. The predicate is the **`:library`**
premium feature, and it **really does gate** (the `writable_connection` shape,
not the `transforms-basic` short-circuit shape):

- **Route registration**: `enterprise/backend/src/metabase_enterprise/api_routes/routes.clj:117`
  → `"/data-studio" (premium-handler metabase-enterprise.data-studio.api/routes :library)`,
  and `premium-handler` (line 84) is `ee.api/+require-premium-feature`.
- **No short-circuit**: `enable-library?` is a plain
  `(define-premium-feature ^{:added "0.58.0"} enable-library? "…" :library)`
  (`src/metabase/premium_features/settings.clj:312`) whose `:getter` is the
  macro's `default-premium-feature-getter` — there is no
  `(not is-hosted?)`-style escape like `query-transforms-enabled?` has.
- **FE**: `hasPremiumFeature("library")` →
  `PLUGIN_LIBRARY.isEnabled = true`
  (`enterprise/frontend/src/metabase-enterprise/data-studio/library/index.ts:24`),
  which is what mounts `PublishTablesModal` / `UnpublishTablesModal` and, via
  `isLibraryEnabled` in `TablePickerTreeTable.tsx:284`, the whole `Published`
  column the tests assert on.
- **Empirically confirmed, accidentally**: a probe that activated the token
  before signing in (so the `PUT` 401'd silently) then got
  `POST /api/ee/library → 402 error-premium-feature-not-available`, thrown from
  `token_check.clj assert_has_feature` via
  `metabase_enterprise.api.routes.common$_PLUS_require_premium_feature`. That is
  the predicate firing, observed end to end.
- **Feature is present in the token**: `/api/session/properties` on the slot →
  `token-features` **42 ON**, `library: true`.

⚠️ **The `.env` trailing-comma hazard is INAPPLICABLE here** — `support/env.ts`
reads the repo-root **`cypress.env.json`**, explicitly not `.env` ("its token
values are stale"). All four token values there are **64 chars**, and the
resulting `token-features` reads `ON (42)`, not `ON (0)`. Nothing stripped, no
token value printed. Banking this rather than manufacturing work from it.

## Snowplow vantage: the BROWSER BOUNDARY (and why)

`installSnowplowCapture` (`support/search-snowplow.ts`), not the per-slot
collector, and **not** a no-op stub.

- **Decided from the call sites**, as the brief asks: all six asserted events
  (`data_studio_bulk_sync_settings_clicked`, `data_studio_table_schema_sync_started`,
  `data_studio_table_fields_rescan_started`,
  `data_studio_table_field_values_discard_started`,
  `data_studio_bulk_attribute_updated`, `data_studio_table_unpublished`) are
  emitted by FE `trackSimpleEvent` calls in
  `frontend/src/metabase/common/data-studio/analytics.ts:59-103`. None is
  backend-emitted, so the collector has no vantage the boundary lacks — and
  `installSnowplowCapture`'s `page.route` fulfils the tracker POST before it
  leaves the browser, so with the capture installed the collector sees nothing
  at all.
- **Second reason**: every upstream assertion is an exact count
  (`expectUnstructuredSnowplowEvent` defaults to `count = 1`), and the collector
  accumulates across the whole worker lifetime. The boundary capture is
  per-page and `reset()` in `beforeEach`, matching `H.resetSnowplow()`.
- **Not dead setup**: unlike the spec cited in the brief, `H.resetSnowplow()`
  here backs six real assertions. Mutation M3 confirms they execute (below).
- Recorded gap (inherited, not new): `expectNoBadSnowplowEvents` would degrade
  to a structural check at this seam — but this spec never calls it, so nothing
  is lost here.
- `installSnowplowCapture` matching on pathname regardless of origin is not a
  hazard here: no assertion depends on a cross-origin distinction.

## How many rows the bulk operation actually selected vs how many exist

Measured, not assumed (all numbers from probe runs on slot 5 against the jar):

| test | selection posted | rows that exist | rows the assertion covered |
|---|---|---|---|
| `syncing multiple tables` | `table_ids: [197, 199]` (2 explicit ids) | 8 tables in `public` | 2 (both verified `toBeChecked`) |
| `…attributes for tables` | 2 explicit table ids | 8 | 2 |
| `…attributes for db` | **`database_ids: [2]`** — server-side, unbounded | **8** tables on DB 2 | **8 of 8** — the picker rendered all 8, so virtualization causes **no gap** here |
| `…attributes for schema` | **`schema_ids`** for `Schema A` + `Schema B` — server-side | 39 tables / 29 schemas on DB 2; picker renders **14 of 29** schema rows (virtualized) | **4** table rows: `Schema A/{Animals, Inspect Sql Table, Transform Table}` + `Schema B/Animals`. All 4 are inside the selected schemas, so the loop is correct — and *stronger* than on a clean container (2 rows). The two extra tables are debris from the transforms specs, not from `many_schemas`. |
| `…with filters` (search `a`) | 2 explicit table ids | **28** tables named `Animals` in the app DB | 2 — after the pinning deviation below |

The "clicking field 1 un-checks field 0" failure mode from the brief was
**checked for and not observed**: every test asserts `toBeChecked()` on every
box it ticked after all ticks are done, and all pass. Playwright's own `check()`
verifies its subject but not its neighbours, so these assertions were added
deliberately (declared in the spec header as port-safety, not upstream).

## The one deviation: `Animals` pinned to `Domestic` in the search test

**Symptom:** `should change metadata … with filters` failed on the first run
with a strict-mode violation — `getTable("Animals")` resolved to **6** elements.

**Ruled out port drift first** (the brief's strong prior). The locator
`filter({hasText:/Animals/})` over `[data-type="table"]` tree-items is a
faithful translation of Cypress's `.filter(':contains("Animals")')`; the six
matches are a property of the **data**, measured:

- `GET /api/table` → **28** tables named `Animals`: `Domestic`, `Wild`, and
  `Schema A`…`Schema Z`.
- The results grid is virtualized; at assertion time it had rendered
  `Domestic/Animals` plus `Schema A–E/Animals` = 6.

**And this is not purely #85 contamination.** The describe's *own* `beforeEach`
runs `multi_schema`, which creates `Domestic.Animals` **and** `Wild.Animals`.
So on a pristine CI container the same search matches **2** rows, and the
follow-up `getTable("Animals").findByTestId("table-owner")` is a singular
testing-library query against a 2-element subject. The upstream selector is
latently ambiguous by construction; the shared-container debris widened 2 → 28.

**Disposition:** the two `Animals` references in that test now use
`getTableInSchema(page, {databaseId: 2, schemaName: "Domestic", tableName: "Animals"})`
— the attribute-filter shape already established by
`support/datamodel-data-studio.ts getTableCheckbox`. `Accounts` is genuinely
unique (measured: 1 row, Sample Database / `PUBLIC`) and keeps the upstream
locator untouched. The deviation is declared inline in the spec.

⚠️ **What I did NOT verify:** whether upstream Cypress passes this test on a
clean container. Per the standing rule I did **not** run a Cypress cross-check
(it would break live sibling slots), so I cannot say the original is broken —
only that its selector is ambiguous under the fixture it creates. Recording
this as an open question rather than a product-bug claim.

## Other findings

**Vacuous upstream assertion, ported verbatim.**
`cy.findByTestId("loading-placeholder").should("not.exist")` in
`allows to edit attributes for schema` can never fail: the `loading-placeholder`
testid is rendered only by the **legacy admin** picker
(`frontend/src/metabase/metadata/pages/DataModelV1/components/TablePicker/components/Results.tsx:351`).
The **data-studio** picker under test
(`frontend/src/metabase/data-studio/data-model/components/TablePicker/`) never
renders it — grepped both trees, including `enterprise/frontend/`. Kept
verbatim (`toHaveCount(0)`) with the analysis inline, per the weak-but-faithful
rule; the intent ("wait for the expanded schemas to load") is not unambiguous
enough to justify substituting a different anchor.

**A single-table selection pre-populates the bulk selects — `selectHasValue(…, "")`
is load-bearing.** Discovered by a mis-aimed mutation (M2). With exactly one
table selected, `Visibility layer` renders that table's existing value
(`Internal`), so the upstream `H.selectHasValue("Visibility layer", "")`
precondition fails. This is a genuine, non-vacuous assertion — worth noting
because `should("have.value", "")` reads like the vacuous
`should("not.have.value")` / `be.empty` shapes the brief warns about, and it
is not one.

**Brief hazards checked and found inapplicable (banked, not worked around):**
- *Shared `verifyAndCloseToast` strict-mode violation*: this spec never calls
  it. It uses `H.undoToastList()` (plural, a count) and
  `H.undoToastListContainer()` (a container scope), neither of which has the
  singular-`findByTestId` problem. The 4-toast count assertion passed on every
  run including `--repeat-each=3`. **No local replacement was needed**, and
  `support/data-model.ts` was not touched.
- *`visitDataModel`'s 30s wait gate under #85*: inapplicable. Upstream calls
  `H.DataModel.visitDataStudio()` **bare**, which waits only on
  `GET /api/database` — not the schema auto-expand request. No navigation to
  `schemaId` was needed.
- *`resyncDatabase` bare form*: upstream passes no `tables` in the GDGT
  `beforeEach`, so the wait degenerates to "the DB reports ≥1 table". Ported
  as-is. Passing `tables` would not strengthen it here either: the fixture
  DROP/CREATEs tables that keep the same name, so the app-DB rows survive with
  `initial_sync_status: "complete"` and satisfy the wait instantly regardless.
  Recorded rather than "fixed".
- *`cy.intercept` 500-stub empty-body trap*: no stubs in this spec.
- *Harness 1280×720 defect*: sidestepped, not worked around —
  `test.use({ viewport: { width: 1600, height: 800 } })` is the faithful port of
  the describe's `{ viewportWidth: 1600 }` (Cypress's configured height is 800,
  `e2e/support/config.js:301`) and overrides the device default.
- *`/Publish/` vs `/Unpublish/` ambiguity*: considered and dismissed on
  evidence — `"Unpublish"` has a lowercase `p`, and Playwright regex name
  matching is case-sensitive, so `/Publish/` is unambiguous even once both
  buttons render.

## Mutation testing

Every mutation applied with an anchored replace asserting `count == 1` and read
back from disk before running. All at the **input**, never the expectation.

| # | mutation | landed? | outcome | died where |
|---|---|---|---|---|
| M1 | `…attributes for tables`: select `Reviews` instead of `Products` | verified (grep, line 320) | **KILLED** | spec:362 — `getTable("Products").getByTestId("table-owner")` → element not found |
| M2 | `…attributes for db`: select the `Orders` **table** instead of the **database** | verified (sed read-back) | **KILLED, but at the wrong step** — see below | `support/…:48` — `selectHasValue("Visibility layer", "")` |
| M2b | same test: select `Orders` + `Products` (two tables) instead of the database | verified | **KILLED at the aimed assertion** | spec:521 — the `each` loop over all rendered table rows |
| M3 | `…attributes for tables`: do not perform the `Source` bulk edit | verified (grep) | **KILLED** | spec:350 — `data_studio_bulk_attribute_updated / data_source` snowplow assertion timed out at 0 ≠ 1 |
| M4 | `syncing multiple tables`: select `Reviews` instead of `Products` | verified (sed read-back) | **KILLED** | `support/…:211` — `table_ids` deep-equality, `[197,199]` vs `[197,200]` |

**Calling out my own bad mutation:** M2 was mis-aimed. Selecting a *single*
table changes the toolbar's precondition (the selects pre-populate), so it died
in `selectHasValue` long before reaching the post-condition I wanted to probe.
It is a real kill and it surfaced the finding above, but it says nothing about
the `each` loop. M2b re-aimed at the tail and killed there.

**Surviving-assertion tails observed under M1/M4:** `undoToastList` `toHaveCount(4)`
and the `/2 tables selected/` heading both survive a change of *which* tables
are selected — correctly, since neither is sensitive to identity. Not weaknesses,
just recorded so the coverage picture is honest.

Spec restored **byte-identical**: md5 `d835e59c311cbff41d9108e07e18832f` before
and after, re-verified after the final green run.

## Jar verified BY IDENTITY

`ps` on the :4105 listener → `-jar /Users/fraser/…/target/uberjar/metabase.jar`;
`/api/session/properties` `version.hash` = `751c2a9`, matching
`target/uberjar/COMMIT-ID` = `751c2a98`. Not inferred from `JAR_PATH`.
Note the backend printed `(reused)` on every run, which is exactly the case
where `JAR_PATH` would be silently ignored — hence the `ps` check.

## Shared state: before / after

| | before | after |
|---|---|---|
| non-system schemas in `writable_db` | **29** (`Domestic`, `Wild`, `public`, `Schema A`…`Schema Z`) | **29** (unchanged) |

`resetTestTableManySchemas` is `CREATE SCHEMA IF NOT EXISTS` + DROP/CREATE of the
inner `Animals` table, so it recreated the 26 pre-existing FINDINGS #85 schemas
and added none. `resetTestTableMultiSchema` likewise only recreated tables
inside the existing `Domestic`/`Wild`. **Nothing was dropped** — foreign schemas
left alone as instructed, siblings are live.

## fixmes

None. All 7 tests execute and pass.

## Cleanup

Two throwaway probe specs (`tests/zz-probe-*.spec.ts`) and the mutation baseline
copy under `scratchpad/` were removed; my `test-results/` output directories were
removed. No background pollers were started, so none to reap; siblings' processes
and files untouched. `PORTED.txt`, `QUEUE.md`, `playwright.config.ts` and all
shared support modules (including `support/data-model.ts`, which has the owed
fix) were **not** edited. Nothing committed.
