/**
 * Helpers for the Playwright port of
 * e2e/test/scenarios/data-studio/transforms/reproductions.cy.spec.ts
 * (277 lines, 6 independent `issue NNNNN` describes with one test each).
 *
 * New module (PORTING rule 9). Shared support modules are imported read-only
 * and never edited — `transforms.ts`, `transforms-codegen.ts`,
 * `transforms-inspect.ts`, `schema-viewer.ts`, `data-model.ts`,
 * `documents-core.ts`, `native-reproductions.ts` and `ui.ts` all already carry
 * pieces this port needs, and are reused rather than re-implemented.
 *
 * ============================== TOKEN TIER ==============================
 * The queue tags this spec `token`, and every one of the six `beforeEach`es
 * calls `H.activateToken("pro-self-hosted")` + `H.updateSetting(
 * "transforms-enabled", true)`. The tag is a RED HERRING for this file, and
 * the predicate was read in the source rather than inferred from the tag:
 *
 *   src/metabase/premium_features/token_check.clj:715
 *     (defn query-transforms-enabled? []
 *       (and (setting/get :transforms-enabled)
 *            (or (not (premium-features.settings/is-hosted?))
 *                (has-feature? :transforms-basic))))
 *
 *   src/metabase/premium_features/token_check.clj:724
 *     (defn python-transforms-enabled? []
 *       (and (setting/get :transforms-enabled)
 *            (has-feature? :transforms-basic)
 *            (has-feature? :transforms-python)))
 *
 * and `src/metabase/transforms/util.clj:41-42` routes `check-feature-enabled!`
 * to the first for query (native/MBQL) transforms and to the second for python.
 * On a self-hosted slot backend `is-hosted?` is false, so the `or` short
 * circuits and the missing `:transforms-basic` feature never matters. **This
 * spec creates only native-SQL and MBQL transforms — there is no python
 * transform anywhere in the file**, so the python arm is not exercised at all
 * and its 402 is irrelevant here.
 *
 * The one thing that IS load-bearing is `transforms-enabled`. Its getter
 * (src/metabase/transforms/settings.clj:61) falls back to
 * `(and is-hosted? (has-feature? :transforms-basic))` only when the setting is
 * UNSET; the beforeEach sets it explicitly to `true`, so the fallback is dead
 * and the token is irrelevant on that path too.
 *
 * Conclusion, then confirmed by a gate-OFF control run (see
 * findings-inbox/transforms-reproductions.md): removing `activateToken`
 * entirely leaves all six tests passing. `activateToken` is kept in the
 * beforeEach anyway — it is what upstream does, and dropping it would be an
 * unrequested change to shared backend state on a slot other specs reuse.
 * =======================================================================
 *
 * QA-DATABASE TIER. Every describe restores the `postgres-writable` snapshot
 * and drives WRITABLE_DB_ID (the writable QA postgres on :5404), so the whole
 * file is gated on PW_QA_DB_ENABLED. This port is meant to EXECUTE with the
 * gate on; a green all-skipped run is the failure mode, not the goal
 * (FINDINGS #49). Upstream carries no `@external` tag on this file even though
 * it drives the writable container exactly as its tagged siblings do — the tag
 * is missing, not absent-by-design.
 *
 * ==================== TARGET-TABLE NAMES: TWO RENAMES ====================
 * `POST /api/transform` 403s with "A table with that name already exists."
 * when the PHYSICAL target table is present in the warehouse
 * (transforms_rest/api/transform.clj:183 → `target-table-exists?`), and it does
 * so on CREATE — a transform does not have to be RUN for the next create to
 * collide. The writable container here is long-lived and shared across slots
 * and agents, and (unlike Cypress's `H.restore("*-writable")`, which also calls
 * `resetWritableDb`) nothing in this harness ever resets it.
 *
 * MEASURED, not assumed. Before a line of this port was written:
 *   $ docker exec metabase-e2e-postgres-sample-1 psql -U metabase -d writable_db \
 *       -c "select table_schema, table_name from information_schema.tables
 *           where lower(table_name) like '%transform%'"
 *      table_schema |   table_name
 *     --------------+-----------------
 *      Schema A     | transform_table
 *
 * `"Schema A"."transform_table"` — upstream's GDGT-1774 target, verbatim — was
 * ALREADY PRESENT, left there by a live sibling (`transforms.spec.ts`, whose
 * own `resetTransformTargetTables` owns every `%transform%` table in
 * Schema A/B/Domestic/Wild/public). Porting that literal would have 403'd the
 * create on the first run. Deleting it was rejected: three QA-DB agents share
 * this container and the sibling may be mid-run.
 *
 * So two target-table LITERALS are renamed, following the precedent and
 * rationale already recorded in support/transforms-incremental.ts:
 *
 *   GDGT-1774  "Schema A"."transform_table"     -> "Schema A"."repro_1774_target"
 *   #69904     public."deleted_transform_table" -> public."repro_69904_target"
 *
 * The second rename is defensive in the opposite direction: the literal
 * `deleted_transform_table` matches the sibling's `%transform%` sweep over
 * `public`, so a sibling could DROP it out from under this test mid-run.
 * `repro_69904_target` sits outside that pattern.
 *
 * NEITHER NAME IS THE SUBJECT OF AN ASSERTION. GDGT-1774 asserts that the
 * incremental field picker offers options; #69904 asserts the Data Model table
 * section reads "Transform does not exist anymore". Nothing reads the table
 * name back, so this changes no assertion — it restores the clean-warehouse
 * precondition upstream gets for free from a per-job CI container.
 *
 * The other four target names are left VERBATIM and were checked individually:
 * #68378 ("SQL transform" -> `empty_schema.sql_transform`), GDGT-2429
 * ("GDGT-2429 transform"), and UXW-3160 (`public.uxw_3160_target`) all create a
 * transform WITHOUT running it, so no physical table is ever written and the
 * `target-table-exists?` check can never trip; GDGT-1776 creates nothing.
 * ========================================================================
 */
import type { Page } from "@playwright/test";

import { queryWritableDB } from "./schema-viewer";

// ---------------------------------------------------------------------------
// Constants (spec header, lines 6-8)
// ---------------------------------------------------------------------------

export const SOURCE_TABLE = "Animals";
export const TARGET_SCHEMA = "Schema A";
export const DB_NAME = "Writable Postgres12";

/**
 * Upstream `TARGET_TABLE = "transform_table"`, renamed. See the "TWO RENAMES"
 * block in the module header — the upstream literal is currently occupied in
 * `"Schema A"` by a live sibling spec, and `POST /api/transform` 403s on it.
 */
export const TARGET_TABLE = "repro_1774_target";

/**
 * Upstream `TRANSFORM_TARGET_TABLE = "deleted_transform_table"` (spec line
 * 178), renamed out of `transforms.spec.ts`'s `%transform%` sweep over
 * `public`. See the module header.
 */
export const DELETED_TRANSFORM_TARGET_TABLE = "repro_69904_target";

export const QA_DB_SKIP_REASON =
  "Requires the writable postgres QA container + the postgres-writable snapshot (set PW_QA_DB_ENABLED)";

// ---------------------------------------------------------------------------
// Warehouse fixtures
// ---------------------------------------------------------------------------

/**
 * Port of `H.resetTestTable({ type: "postgres", table: "empty_schema" })`.
 *
 * The upstream fixture (e2e/support/test_tables.js:291) is exactly
 * `dbClient.schema.createSchemaIfNotExists("empty_schema")` and nothing else —
 * it creates no table, which is the entire point of #68378: an EMPTY schema has
 * no synced tables, so it can only reach the target-schema picker through
 * `GET /api/database/:id/syncable_schemas`, which queries the warehouse live.
 * Transcribed as raw SQL rather than through knex so this module has no
 * dependency the Cypress db tasks don't already carry.
 *
 * Deliberately NOT dropped afterwards: `empty_schema` is a fixture upstream
 * leaves behind too, and dropping schemas in the shared container is what the
 * standing rule forbids.
 */
export async function resetEmptySchema() {
  await queryWritableDB(`CREATE SCHEMA IF NOT EXISTS "empty_schema";`);
}

/**
 * Drop the two physical tables this spec's transforms can write.
 *
 * No counterpart in the Cypress original — the app-DB snapshot restore in the
 * beforeEach resets Metabase's own state but cannot touch the warehouse, and
 * `POST /api/transform`'s already-exists guard is a physical check. See the
 * module header for the measurement that forced this.
 *
 * Deliberately narrow. It matches TWO EXACT TABLE NAMES, both of which were
 * chosen (see the renames above) to collide with nothing else in the corpus,
 * and it never drops a schema. It therefore cannot disturb the sibling QA-DB
 * specs sharing this container.
 *
 * Only `repro_69904_target` is ever actually created (#69904 is the sole test
 * in the file that RUNS its transform); `repro_1774_target` is swept for
 * symmetry and to stay correct if that test ever grows a run.
 */
export async function resetReproTargetTables() {
  await queryWritableDB(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
          AND table_name IN ('${TARGET_TABLE}', '${DELETED_TRANSFORM_TARGET_TABLE}')
      LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', r.table_schema, r.table_name);
      END LOOP;
    END $$;
  `);
}

// ---------------------------------------------------------------------------
// Spec-local getters (spec lines 270-276)
// ---------------------------------------------------------------------------

/** Port of the spec-local `visitTransformListPage()`. */
export const visitTransformListPage = (page: Page) =>
  page.goto("/data-studio/transforms");

/** Port of the spec-local `getQueryEditor()`. */
export const getQueryEditor = (page: Page) =>
  page.getByTestId("transform-query-editor");

/**
 * Port of `H.DataStudio.Transforms.visitSettingsTab(id)`
 * (e2e/support/helpers/e2e-data-studio-helpers.ts:52). Not present on the
 * shared `DataStudio` object in support/transforms.ts, and that module is
 * read-only here, so it is defined locally rather than added there.
 */
export const visitTransformSettingsTab = (page: Page, transformId: number) =>
  page.goto(`/data-studio/transforms/${transformId}/settings`);

// ---------------------------------------------------------------------------
// createMockSearchResult (metabase-types/api/mocks) — GDGT-1776
// ---------------------------------------------------------------------------

/**
 * Port of `createMockSearchResult` (frontend/src/metabase-types/api/mocks/
 * search.ts:11) together with the `createMockCollection` /
 * `createMockEntityId` it composes (mocks/collection.ts:11, mocks/
 * entity-id.ts:5). Field-for-field transcription of all three.
 *
 * The Playwright package cannot import from `frontend/src` — it has no path
 * alias for `metabase-types/*` and pulling one in would drag the FE tsconfig
 * into this package — so the factory is reproduced rather than imported.
 * `nanoid` is likewise replaced by an equivalent 21-character generator over
 * the same alphabet (`NANOID_LENGTH = 21`, metabase-types/api/entity-id.ts:22);
 * nothing in the MiniPicker reads `entity_id` off a `model: "table"` row, so
 * the value only has to be well-formed and distinct per item, which it is.
 */
const NANOID_ALPHABET =
  "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
const NANOID_LENGTH = 21;

function createMockEntityId(): string {
  let id = "";
  for (let index = 0; index < NANOID_LENGTH; index++) {
    id += NANOID_ALPHABET[Math.floor(Math.random() * NANOID_ALPHABET.length)];
  }
  return id;
}

function createMockCollection(options: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Collection",
    description: null,
    location: "/",
    can_write: true,
    can_restore: false,
    can_delete: false,
    archived: false,
    is_personal: false,
    authority_level: null,
    namespace: null,
    entity_id: createMockEntityId(),
    ...options,
  };
}

export function createMockSearchResult(
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  const collection = createMockCollection(
    (options.collection as Record<string, unknown>) ?? undefined,
  );

  return {
    id: 1,
    name: "Mock search result",
    description: "Mock search result description",
    model: "card",
    display: null,
    model_index_id: null,
    model_id: null,
    archived: null,
    collection,
    collection_position: null,
    can_write: true,
    table_id: 1,
    table_name: null,
    table_display_name: null,
    bookmark: null,
    database_id: 1,
    database_name: "test-data",
    pk_ref: null,
    table_schema: null,
    collection_authority_level: null,
    updated_at: "2023-01-01T00:00:00.000Z",
    moderated_status: null,
    model_name: null,
    table_description: null,
    initial_sync_status: null,
    dashboard_count: null,
    dashboard: null,
    context: null,
    created_at: "2022-01-01T00:00:00.000Z",
    creator_common_name: "Testy Tableton",
    creator_id: 2,
    last_edited_at: "2023-01-01T00:00:00.000Z",
    last_editor_common_name: "Bobby Tables",
    last_editor_id: 1,
    ...options,
  };
}
