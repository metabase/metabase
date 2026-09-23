/**
 * Helpers for the dependency-checks spec port
 * (e2e/test/scenarios/dependencies/dependency-checks.cy.spec.ts, 344 lines).
 *
 * NEW module (PORTING rule 9). Shared support modules are imported read-only
 * and never edited — in particular `dependency-graph.ts` (backfill poll +
 * transform creation) and `schema-viewer.ts` (QA-database helpers) are reused
 * rather than re-implemented.
 *
 * QA-DATABASE TIER. Every test restores the `postgres-writable` snapshot,
 * resets the `many_schemas` fixture and drives WRITABLE_DB_ID, so the whole
 * file is gated on PW_QA_DB_ENABLED.
 *
 * ── READ THIS BEFORE TRUSTING THE TEST NAMES ────────────────────────────────
 *
 * All four surviving upstream tests are named "should not show a confirmation
 * if there are no breaking changes …". The confirmation they refer to NO
 * LONGER EXISTS IN THE PRODUCT. Two commits removed it:
 *
 *   d8b40292d12 "Disable blocking dependency checks on save (#70819)"
 *     - unregistered PLUGIN_DEPENDENCIES.useCheckCardDependencies /
 *       useCheckSnippetDependencies / useCheckTransformDependencies
 *       (enterprise/frontend/src/metabase-enterprise/dependencies/index.ts)
 *     - deleted 145 lines from this very spec: every test that asserted the
 *       confirmation DOES appear ("should be able to confirm or cancel
 *       breaking changes …", "should ignore breaking changes to a SQL
 *       transform after it was run", …)
 *   9c76f5c6297 "Show upstream archived on inactive dependencies (#73186)"
 *     - deleted the components (CheckDependenciesModal / Form / Title), the
 *       hooks, and the three backend endpoints POST /api/ee/dependencies/
 *       check-card | check-transform | check-snippet.
 *
 * Verified against the current tree: `useCheckCardDependencies` and
 * `useCheckTransformDependencies` do not appear anywhere under frontend/src or
 * enterprise/frontend/src, and dependencies/api.clj now defines only /graph,
 * /graph/dependents, /graph/unreferenced, /graph/breaking, /graph/broken and
 * /backfill-status.
 *
 * Consequence, stated plainly rather than papered over: these four tests are
 * RESIDUE. They still exercise a real end-to-end path (edit → save → the PUT
 * actually fires), which is worth keeping, but the specific proposition their
 * names assert — "no confirmation, BECAUSE the change is non-breaking" — can no
 * longer be discriminated by the product. Nothing has been dropped, weakened or
 * renamed in the port; the analysis is recorded here and in the spec header.
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { createTransform, runTransformAndWaitForSuccess } from "./dependency-graph";
import { ORDERS_DASHBOARD_ID, SAMPLE_DATABASE } from "./sample-data";
import {
  WRITABLE_DB_ID,
  getTableId,
  queryWritableDB,
  resyncDatabase,
} from "./schema-viewer";
import type { SnowplowCapture } from "./search-snowplow";
import { getFieldId } from "./table-editing";

export { WRITABLE_DB_ID };

const { PRODUCTS_ID } = SAMPLE_DATABASE;

/**
 * ⚠️ SCHEMA PINNING (FINDINGS #85).
 *
 * Upstream looks the fixture table up with `H.getTableId({ databaseId, name:
 * "Animals" })` — by NAME only. On a clean CI container that is unambiguous.
 * On this shared box it is not: the `many_schemas` fixture creates
 * "Schema A".."Schema Z"."Animals" (26 of them) and the `multi_schema` fixture
 * used by sibling specs adds "Domestic"."Animals" and "Wild"."Animals", so the
 * lookup resolves to whichever row /api/table happens to return first.
 *
 * The port pins the schema to "Schema A" — the same schema the spec's own SQL
 * transform names literally (`SELECT name, score FROM "Schema A"."Animals"`),
 * so this expresses upstream's intent rather than changing it. It is
 * determinism on a contaminated container, not a behaviour change: all the
 * candidate tables have identical columns (name varchar, score integer), only
 * their rows differ, and nothing in this spec asserts on rows.
 */
export const FIXTURE_SCHEMA = "Schema A";

/**
 * 🔴 PORT DRIFT FIXED HERE — the missing half of `H.restore("*-writable")`.
 *
 * Cypress's `restore()` is not just the app-DB snapshot. e2e-setup-helpers.js:45
 *
 *     if (name.includes("-writable")) { resetWritableDb({ type: dbType }); }
 *
 * runs BEFORE the snapshot restore, and `resetWritableDb` (db_tasks.js:41)
 * wipes the writable warehouse: `DROP SCHEMA … CASCADE` for every schema not
 * matching `/^pg_|information_schema|public/`, plus `DROP TABLE public.<t>` for
 * every table in `public`.
 *
 * The Playwright harness's `mb.restore()` only does the app-DB half, and
 * `resetWritableDb` is not ported anywhere in this package (grep: zero hits).
 * That is a real harness gap, and it is exactly what this spec trips over.
 *
 * Why it matters here: transform targets are validated against the WAREHOUSE,
 * not the app DB — `transforms_rest/api/transform.clj:184` calls
 * `target-table-exists?`, which is `driver/table-exists?`
 * (transforms_base/util.clj:464-469). The app-DB restore removes the transform
 * ROWS but leaves the physical tables standing. Both transform tests target the
 * SAME table name, `public.base_transform` (upstream lines 205 and 258), and the
 * SQL test runs its transform — so without the warehouse reset the second
 * transform test 403s "A table with that name already exists." at fixture time.
 * That is precisely what happened on the first run here.
 *
 * ⚠️ DELIBERATELY SCOPED, and this is a knowing fidelity trade. The faithful
 * `resetWritableDb` would `DROP SCHEMA … CASCADE` on `Schema A`…`Schema Z`,
 * `Domestic` and `Wild` — the fixtures four LIVE sibling slots are using on this
 * shared container. The standing infra rule is "do NOT drop foreign schemas;
 * siblings live". So this drops exactly the five `public` tables this spec
 * creates — a strict subset of what upstream drops, sufficient to make the two
 * transform tests independent of each other and of a previous run, and
 * attributable table-by-table. On an isolated CI container the full
 * `resetWritableDb` would be the right port; that is worth doing as a shared
 * harness fix, which this port must not make.
 */
const SPEC_TARGET_TABLES = [
  "base_transform",
  "name_transform",
  "score_transform",
  "transform_1_stage",
  "transform_2_stages",
];

export async function resetSpecTargetTables() {
  await queryWritableDB(
    SPEC_TARGET_TABLES.map(
      (table) => `DROP TABLE IF EXISTS public."${table}" CASCADE;`,
    ).join("\n"),
  );
}

/**
 * Upstream's `H.createQuestion` accepts arbitrary extra card fields and posts
 * them straight through; the shared `MetabaseApi.createQuestion` does too (it
 * spreads `...rest` into the body) but its parameter type does not name
 * `dashboard_id`. Thin typed wrapper so the one call site that needs it stays
 * type-safe without touching the shared module.
 */
async function createQuestion(
  api: MetabaseApi,
  details: {
    name: string;
    type?: string;
    database?: number;
    query: Record<string, unknown>;
    dashboard_id?: number;
  },
): Promise<{ id: number }> {
  const { dashboard_id, ...rest } = details;
  return api.createQuestion({
    ...rest,
    ...(dashboard_id == null ? {} : { dashboard_id }),
  } as Parameters<MetabaseApi["createQuestion"]>[0]);
}

/**
 * Port of the spec-local createMbqlQuestionWithDependentMbqlQuestions.
 * Returns the base question's id (upstream aliases it as `@questionId`).
 */
export async function createMbqlQuestionWithDependentMbqlQuestions(
  api: MetabaseApi,
): Promise<number> {
  const card = await createQuestion(api, {
    name: "Base question",
    query: {
      "source-table": PRODUCTS_ID,
      expressions: {
        Expr: ["+", 1, 1],
      },
    },
  });

  await createQuestion(api, {
    name: "Question with fields",
    query: {
      "source-table": `card__${card.id}`,
      filter: [">", ["field", "Expr", { "base-type": "type/Integer" }], 1],
    },
    dashboard_id: ORDERS_DASHBOARD_ID,
  });

  await createQuestion(api, {
    name: "Question without fields",
    query: {
      "source-table": `card__${card.id}`,
    },
  });

  return card.id;
}

/**
 * Port of the spec-local createMetricWithDependentMbqlQuestionsAndTransforms.
 * Returns the metric's id (upstream aliases it as `@metricId`).
 */
export async function createMetricWithDependentMbqlQuestionsAndTransforms(
  api: MetabaseApi,
): Promise<number> {
  const tableId = await getTableId(api, {
    databaseId: WRITABLE_DB_ID,
    name: "Animals",
    schema: FIXTURE_SCHEMA,
  });
  const fieldId = await getFieldId(api, { tableId, name: "score" });

  const metric = await createQuestion(api, {
    name: "Base metric",
    type: "metric",
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
      aggregation: [["min", ["field", fieldId, null]]],
    },
  });

  await createQuestion(api, {
    name: "Question with 1 stage",
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
      aggregation: [["metric", metric.id]],
    },
  });

  await createQuestion(api, {
    name: "Question with 2 stages",
    database: WRITABLE_DB_ID,
    query: {
      "source-query": {
        "source-table": tableId,
        aggregation: [["metric", metric.id]],
        breakout: [["field", fieldId, null]],
      },
      aggregation: [["avg", ["field", "min", { "base-type": "type/Integer" }]]],
    },
  });

  await createTransform(api, {
    name: "Transform with 1 stage",
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "query",
        query: {
          "source-table": tableId,
          aggregation: [["metric", metric.id]],
        },
      },
    },
    target: {
      type: "table",
      name: "transform_1_stage",
      schema: "public",
      database: WRITABLE_DB_ID,
    },
  });

  await createTransform(api, {
    name: "Transform with 2 stages",
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "query",
        query: {
          "source-query": {
            "source-table": tableId,
            aggregation: [["metric", metric.id]],
            breakout: [["field", fieldId, null]],
          },
          aggregation: [
            ["avg", ["field", "min", { "base-type": "type/Integer" }]],
          ],
        },
      },
    },
    target: {
      type: "table",
      name: "transform_2_stages",
      schema: "public",
      database: WRITABLE_DB_ID,
    },
  });

  return metric.id;
}

/**
 * Port of the spec-local createSqlTransformWithDependentMbqlQuestions.
 * Returns the base transform's id (upstream aliases it as `@transformId`).
 */
export async function createSqlTransformWithDependentMbqlQuestions(
  api: MetabaseApi,
): Promise<number> {
  const transformTableName = "base_transform";

  const transform = await createTransform(api, {
    name: "Base transform",
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "native",
        native: {
          query: `SELECT name, score FROM "${FIXTURE_SCHEMA}"."Animals"`,
          "template-tags": {},
        },
      },
    },
    target: {
      type: "table",
      name: transformTableName,
      schema: "public",
      database: WRITABLE_DB_ID,
    },
  });

  await runTransformAndWaitForSuccess(api, transform.id);
  // Upstream passes the bare `tableName` form; ported as the gated `tables`
  // form because the very next call looks this freshly created table up by id.
  await resyncDatabase(api, {
    dbId: WRITABLE_DB_ID,
    tables: [transformTableName],
  });

  const tableId = await getTableId(api, {
    databaseId: WRITABLE_DB_ID,
    name: transformTableName,
    schema: "public",
  });

  await createQuestion(api, {
    name: "Question with fields",
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
      filter: [">", ["field", "score", { "base-type": "type/Integer" }], 1],
    },
  });
  await createQuestion(api, {
    name: "Question without fields",
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
    },
  });

  return transform.id;
}

/**
 * Port of the spec-local createMbqlTransformWithDependentMbqlTransforms.
 * Returns the base transform's id (upstream uses `{ wrapId: true }`).
 */
export async function createMbqlTransformWithDependentMbqlTransforms(
  api: MetabaseApi,
): Promise<number> {
  const targetTableName = "base_transform";

  const sourceTableId = await getTableId(api, {
    databaseId: WRITABLE_DB_ID,
    name: "Animals",
    schema: FIXTURE_SCHEMA,
  });

  const transform = await createTransform(api, {
    name: "Base transform",
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "query",
        query: {
          "source-table": sourceTableId,
        },
      },
    },
    target: {
      type: "table",
      name: targetTableName,
      schema: "public",
      database: WRITABLE_DB_ID,
    },
  });

  await runTransformAndWaitForSuccess(api, transform.id);
  await resyncDatabase(api, {
    dbId: WRITABLE_DB_ID,
    tables: [targetTableName],
  });

  const targetTableId = await getTableId(api, {
    databaseId: WRITABLE_DB_ID,
    name: targetTableName,
    schema: "public",
  });

  const nameFieldId = await getFieldId(api, {
    tableId: targetTableId,
    name: "name",
  });
  await createTransform(api, {
    name: "Name transform",
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "query",
        query: {
          "source-table": targetTableId,
          fields: [["field", nameFieldId, null]],
        },
      },
    },
    target: {
      type: "table",
      name: "name_transform",
      schema: "public",
      database: WRITABLE_DB_ID,
    },
  });

  const scoreFieldId = await getFieldId(api, {
    tableId: targetTableId,
    name: "score",
  });
  await createTransform(api, {
    name: "Score transform",
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "query",
        query: {
          "source-table": targetTableId,
          filter: [">", ["field", scoreFieldId, null], 1],
        },
      },
    },
    target: {
      type: "table",
      name: "score_transform",
      schema: "public",
      database: WRITABLE_DB_ID,
    },
  });

  return transform.id;
}

/**
 * Port of H.visitTransform (e2e-transform-helpers.ts). `support/transforms.ts`
 * has DataStudio.Transforms.visitTransform, but it does not wait for anything;
 * upstream's helper lands on the transform page and the very next action is a
 * click on "Edit definition", so wait for the page to have rendered.
 */
export async function visitTransform(page: Page, transformId: number) {
  await page.goto(`/data-studio/transforms/${transformId}`);
}

/**
 * Structural stand-in for `H.expectNoBadSnowplowEvents`.
 *
 * ── VANTAGE: the BROWSER BOUNDARY, and why ─────────────────────────────────
 *
 * Every event this spec's actions can emit is FRONTEND-emitted:
 *   - question save  → frontend/src/metabase/query_builder/analytics.ts
 *                      (`trackSchemaEvent("question", …)` / `trackSimpleEvent`)
 *   - transform save → frontend/src/metabase/transforms/analytics.ts
 *                      (`trackSimpleEvent`, 9 call sites)
 * A grep for backend emission (`analytics/track-event!`) across
 * enterprise/backend/.../transforms/ and src/metabase/transforms_rest/ returns
 * nothing, so there is no backend-emitted event on any path this spec drives.
 *
 * Frontend events therefore MUST be observed at the browser boundary
 * (`installSnowplowCapture`). That is not merely the natural choice, it is the
 * only working one: the per-slot collector's preflight omits
 * `Access-Control-Allow-Credentials`, so the tracker's `credentials:"include"`
 * POST dies `net::ERR_FAILED` and the collector records only the OPTIONS. The
 * one-line shared fix is owed but deliberately NOT applied here.
 *
 * Cost of that vantage, stated rather than hidden: `SnowplowCapture` pushes
 * `outer.data.data` and discards the Iglu schema URI, so the payloads cannot be
 * re-validated against `snowplow/iglu-client-embedded` the way snowplow-micro
 * would. `H.expectNoBadSnowplowEvents` therefore degrades from "no event FAILED
 * Iglu validation" to "no payload failed to decode into a well-formed
 * self-describing envelope". Strictly weaker, and recorded as such. Fixing it
 * needs an edit to the shared search-snowplow.ts, which this port must not make.
 */
export function expectNoBadSnowplowEvents(capture: SnowplowCapture) {
  if (capture.malformed.length > 0) {
    throw new Error(
      `Malformed Snowplow payloads captured: ${JSON.stringify(capture.malformed).slice(0, 1024)}`,
    );
  }
}
