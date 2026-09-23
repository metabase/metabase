/**
 * Helpers for the Playwright port of
 * e2e/test/scenarios/data-studio/data-model/model-to-transform.cy.spec.ts.
 *
 * Every function here is a port of a spec-local function of the same name in
 * the Cypress original (the file declares them all at the bottom); nothing is
 * shared with another port, so this module is owned entirely by
 * tests/model-to-transform.spec.ts.
 */
import { expect } from "@playwright/test";
import type { Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { createQuestion, createQuestionAndDashboard } from "./factories";
import {
  WRITABLE_DB_ID,
  getTableId,
  queryWritableDB,
  resyncDatabase,
} from "./schema-viewer";
import { getFieldId } from "./table-editing";
import { main, modal } from "./ui";

export const QA_DB_SKIP_REASON =
  "Requires the writable QA Postgres container (upstream @external); run with PW_QA_DB_ENABLED=1";

export const SOURCE_TABLE = "mtt_source_table";
export const OUTPUT_TABLE_SLUG = "mtt_output_table";
export const OUTPUT_TABLE_LABEL = "Mtt Output Table";
export const SOURCE_TABLE_LABEL = "Mtt Source Table";

export const MIGRATE_MODELS_PATH = "/data-studio/transforms/tools/migrate-models";

export const SOURCE_ROW_NAME = "Source Row Alpha";
export const SOURCE_ROW_NAME_2 = "Source Row Beta";

export const CATEGORY_FILTER_ID = "mtt-category-filter";

/**
 * The schema the test tables live in. Upstream's CREATE/DROP statements are
 * unqualified, so they land in the writable container's default search_path
 * (`public`); upstream's `H.getTableId` lookup is likewise schema-less.
 *
 * Pinning it here is NOT a behavioural change — it names the schema the
 * unqualified DDL already targets. It matters because the shared writable
 * container carries ~29 debris schemas (FINDINGS #85) and a schema-less
 * `getTableId` would happily return a same-named table from a foreign schema.
 */
const SOURCE_SCHEMA = "public";

// === writable-DB fixtures (ports of the spec-local functions) ===

/** Port of the spec-local dropAllTestTables. */
export async function dropAllTestTables() {
  await queryWritableDB(`
    DROP TABLE IF EXISTS ${SOURCE_TABLE} CASCADE;
    DROP TABLE IF EXISTS ${OUTPUT_TABLE_SLUG} CASCADE;
    `);
}

/**
 * Port of the spec-local createTestTables.
 *
 * The one deliberate divergence: upstream's trailing
 * `H.resyncDatabase({ dbId: WRITABLE_DB_ID })` uses the BARE form, which gates
 * on nothing — it returns as soon as the DB has *any* synced table, which the
 * snapshot's own tables satisfy immediately (PORTING: "resyncDatabase with no
 * tables gates on NOTHING", measured to cost source-replacement 27/30 tests).
 * Cypress's command-queue latency hid it; Playwright's back-to-back calls do
 * not, and every caller here immediately looks the new table up by id. So the
 * `tables` option is passed. This is a WAIT, not an assertion — it does not
 * change what the spec tests.
 */
export async function createTestTables(api: MetabaseApi) {
  await dropAllTestTables();

  await queryWritableDB(`
    CREATE TABLE ${SOURCE_TABLE} (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      amount NUMERIC(10,2),
      category VARCHAR(100)
    );
    INSERT INTO ${SOURCE_TABLE} VALUES
      (1, '${SOURCE_ROW_NAME}', 100.50, 'A'),
      (2, '${SOURCE_ROW_NAME_2}', 200.75, 'B');
    `);

  await resyncWritableDb(api, [SOURCE_TABLE]);
}

/**
 * Port of H.resyncDatabase + waitForSyncToFinish, scoped to the writable DB.
 * Kept local rather than importing schema-viewer's `resyncDatabase` directly
 * only so the `tables` argument is impossible to forget at a call site.
 */
async function resyncWritableDb(api: MetabaseApi, tables: string[]) {
  await resyncDatabase(api, { dbId: WRITABLE_DB_ID, tables });
}

/** Port of the spec-local getTableId (which pins databaseId to WRITABLE_DB_ID). */
export function getWritableTableId(api: MetabaseApi, tableName: string) {
  return getTableId(api, {
    databaseId: WRITABLE_DB_ID,
    name: tableName,
    schema: SOURCE_SCHEMA,
  });
}

// === card fixtures ===

/** Port of the spec-local createSourceModel. */
export async function createSourceModel(api: MetabaseApi, name: string) {
  const sourceTableId = await getWritableTableId(api, SOURCE_TABLE);
  return createQuestion(api, {
    name,
    database: WRITABLE_DB_ID,
    type: "model",
    query: { "source-table": sourceTableId },
  });
}

/** Port of the spec-local createQuestionOnModel. */
export function createQuestionOnModel(
  api: MetabaseApi,
  name: string,
  modelId: number,
) {
  return createQuestion(api, {
    name,
    database: WRITABLE_DB_ID,
    query: { "source-table": `card__${modelId}` },
  });
}

/**
 * Port of the spec-local createQuestionOnCard. Byte-identical in body to
 * createQuestionOnModel upstream too — kept separate to preserve the
 * one-to-one mapping with the original.
 */
export function createQuestionOnCard(
  api: MetabaseApi,
  name: string,
  parentCardId: number,
) {
  return createQuestion(api, {
    name,
    database: WRITABLE_DB_ID,
    query: { "source-table": `card__${parentCardId}` },
  });
}

/** Port of the spec-local createQuestionJoiningModel. */
export async function createQuestionJoiningModel(
  api: MetabaseApi,
  name: string,
  modelId: number,
) {
  const sourceTableId = await getWritableTableId(api, SOURCE_TABLE);
  const sourceIdField = await getFieldId(api, {
    tableId: sourceTableId,
    name: "id",
  });
  return createQuestion(api, {
    name,
    database: WRITABLE_DB_ID,
    query: {
      "source-table": sourceTableId,
      joins: [
        {
          alias: "ModelJoin",
          "source-table": `card__${modelId}`,
          fields: "all",
          condition: [
            "=",
            ["field", sourceIdField, { "base-type": "type/Integer" }],
            [
              "field",
              "id",
              { "base-type": "type/Integer", "join-alias": "ModelJoin" },
            ],
          ],
        },
      ],
    },
  });
}

/** Port of the spec-local createFilteredDashboardOnModel. */
export async function createFilteredDashboardOnModel(
  api: MetabaseApi,
  modelId: number,
) {
  const sourceTableId = await getWritableTableId(api, SOURCE_TABLE);
  const categoryFieldId = await getFieldId(api, {
    tableId: sourceTableId,
    name: "category",
  });

  const { dashboard_id, card_id } = await createQuestionAndDashboard(api, {
    questionDetails: {
      name: "Dashboard-bound question",
      database: WRITABLE_DB_ID,
      query: { "source-table": `card__${modelId}` },
    },
    dashboardDetails: {
      name: "Dashboard on model",
      parameters: [
        {
          id: CATEGORY_FILTER_ID,
          type: "string/=",
          name: "Category",
          slug: "category",
        },
      ],
    },
  });

  // Port of H.addOrUpdateDashboardCard (the PUT replaces the dashboard's
  // dashcards with exactly this one). Inlined rather than imported from
  // dashboard-management.ts so this module owns its own call shape.
  await api.put(`/api/dashboard/${dashboard_id}`, {
    dashcards: [
      {
        id: -1,
        card_id,
        row: 0,
        col: 0,
        size_x: 11,
        size_y: 6,
        parameter_mappings: [
          {
            parameter_id: CATEGORY_FILTER_ID,
            card_id,
            target: ["dimension", ["field", categoryFieldId, null]],
          },
        ],
      },
    ],
  });

  return { dashboard_id, card_id };
}

// === the migrate-models flow ===

/**
 * NOT in the Cypress original, and load-bearing.
 *
 * `MigrateModelsPage` reads its model list from
 * `useSearchQuery({ models: ["dataset"], context: "model-migration" })` — i.e.
 * the SEARCH INDEX, not `/api/card`. RTK-Query fetches once per mount and then
 * serves the cache, so an assertion retry can never rescue a read that raced
 * the indexer: the row simply never appears. (PORTING: "After any mutation on
 * a search-backed page, poll the backend until the index reflects it BEFORE
 * triggering the FE read.")
 *
 * Cypress got away without this because its command queue puts seconds between
 * the `POST /api/card` and the visit. This is a wait, not an assertion.
 */
export async function waitForModelInSearch(api: MetabaseApi, name: string) {
  await expect
    .poll(
      async () => {
        const response = await api.get(
          "/api/search?models=dataset&context=model-migration",
          { failOnStatusCode: false },
        );
        if (!response.ok()) {
          return false;
        }
        const body = (await response.json()) as {
          data?: { name: string }[];
        };
        return (body.data ?? []).some((result) => result.name === name);
      },
      {
        timeout: 30_000,
        message: `model "${name}" never appeared in the model-migration search results`,
      },
    )
    .toBe(true);
}

/**
 * NOT in the Cypress original, and load-bearing — this is the fix for the one
 * genuine run-1 failure, diagnosed rather than papered over.
 *
 * The replacement runner finds the entities to rewrite via
 * `replacement.usages/transitive-usages` → `deps/transitive-dependents`, i.e.
 * the DEPENDENCY GRAPH. That graph is maintained ASYNCHRONOUSLY: card
 * create/update publish `::card-deps`, whose handler only calls
 * `mark-stale!` + `trigger-backfill-job!`
 * (enterprise/.../dependencies/events.clj:22-38) — "Create/update handlers mark
 * entities stale in dependency_status. The backfill task does the actual
 * computation."
 *
 * So a conversion fired before the backfill has processed a just-created
 * dependent silently MISSES it — and the run still reports `succeeded`, so
 * `waitForReplacementToComplete` is happy and the failure surfaces much later
 * as "the dependent question still points at the model". That is exactly how
 * "keeps a dashboard with a parameter filter working after conversion" failed
 * on run 1 (`data-step-cell` read "Dashboard model", not "Mtt Output Table")
 * while passing in isolation.
 *
 * Cypress never saw it because its command queue puts seconds of latency
 * between the fixture creation and the UI flow. `GET
 * /api/ee/dependencies/backfill-status` is the product's own readiness signal
 * ("`complete` is true when there are no stale or outdated entities awaiting
 * processing", dependencies/api.clj:1047).
 */
export async function waitForDependencyBackfill(api: MetabaseApi) {
  await expect
    .poll(
      async () => {
        const response = await api.get(
          "/api/ee/dependencies/backfill-status",
          { failOnStatusCode: false },
        );
        if (!response.ok()) {
          return false;
        }
        const body = (await response.json()) as { complete: boolean };
        return body.complete;
      },
      {
        timeout: 60_000,
        message:
          "the dependency backfill never reported complete — the replacement runner reads that graph to find dependents",
      },
    )
    .toBe(true);
}

/** Port of the spec-local openMigrateModelsPage. */
export async function openMigrateModelsPage(page: Page) {
  await page.goto(MIGRATE_MODELS_PATH);
  await expect(
    main(page).getByText("Pick a model to convert", { exact: true }),
  ).toBeVisible();
}

/** Port of the spec-local selectModelInTable. */
export async function selectModelInTable(page: Page, modelName: string) {
  await main(page)
    .getByRole("row", { name: new RegExp(modelName) })
    .click();
  await expect(page.getByTestId("model-sidebar")).toBeVisible();
  await expect(
    page.getByTestId("model-sidebar-header").getByText(modelName, {
      exact: true,
    }),
  ).toBeVisible();
}

/** The sidebar's "Convert to a transform" trigger. */
export function convertTriggerButton(page: Page) {
  return page
    .getByTestId("model-sidebar")
    .getByRole("button", { name: /Convert to a transform/ });
}

/** Port of the spec-local openReplaceWithTransformModal. */
export async function openReplaceWithTransformModal(page: Page) {
  await convertTriggerButton(page).click();
  await expect(
    modal(page).getByText("Convert this model to a transform?", {
      exact: true,
    }),
  ).toBeVisible();

  // Upstream asserts the prefilled table name is non-empty via
  //   expect(($input.val() as string).length).to.be.greaterThan(0)
  // and carries the comment "Unjustified type cast. FIXME". Ported as-is:
  // the subject is the length of the prefilled value, nothing more.
  await expect
    .poll(async () => (await tableNameInput(page).inputValue()).length)
    .toBeGreaterThan(0);
}

/**
 * `findByLabelText` is EXACT; Playwright's `getByLabel` is a SUBSTRING match
 * (PORTING), hence `exact: true`.
 */
export function tableNameInput(page: Page) {
  return modal(page).getByLabel("Table name", { exact: true });
}

/** Port of the spec-local getSubmitButton. */
export function getSubmitButton(page: Page) {
  return modal(page).getByRole("button", { name: /Convert to a transform/ });
}

/**
 * Port of the spec-local submitReplaceWithTransformForm.
 *
 * `cy.type()` clicks its subject first (PORTING), so the click is explicit
 * here. `clear().type(x)` → `fill("")` + `pressSequentially(x)`: the field is a
 * Formik-controlled input whose sibling `useEffect` re-derives it from the
 * model name until `TargetNameInput`'s `isDirtyRef` flips on the first
 * `onChange`, so real per-character change events are the faithful shape.
 */
export async function submitReplaceWithTransformForm(
  page: Page,
  targetName = OUTPUT_TABLE_SLUG,
) {
  const input = tableNameInput(page);
  await input.click();
  await input.fill("");
  await input.pressSequentially(targetName);
  await expect(input).toHaveValue(targetName);
  await getSubmitButton(page).click();
}

/**
 * Port of the spec-local waitForReplacementToComplete.
 *
 * Upstream's `cy.wait("@replaceModelWithTransform")` is registered in the
 * `beforeEach` and consumed here, AFTER the submit click. Playwright's
 * `waitForResponse` does not pop past responses, so the promise is created by
 * `convertModelToTransform` BEFORE the click and handed in (port rule 2).
 * A queue (à la model-actions) is unnecessary: exactly one POST to this
 * endpoint happens per conversion, and nothing else awaits it.
 */
export async function waitForReplacementToComplete(
  api: MetabaseApi,
  replacementResponse: Response,
) {
  const POLL_INTERVAL_MS = 250;
  const POLL_TIMEOUT_MS = 30_000;
  const MAX_ATTEMPTS = POLL_TIMEOUT_MS / POLL_INTERVAL_MS;

  const { run_id: runId } = (await replacementResponse.json()) as {
    run_id: number;
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const response = await api.get(`/api/ee/replacement/runs/${runId}`);
    const body = (await response.json()) as {
      status: string;
      message?: string;
    };
    if (body.status === "succeeded") {
      await resyncWritableDb(api, [OUTPUT_TABLE_SLUG]);
      return;
    }
    if (body.status === "failed") {
      throw new Error("Replacement failed: " + body.message);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Replacement polling timed out after ${POLL_TIMEOUT_MS}ms`);
}

/** Port of the spec-local convertModelToTransform. */
export async function convertModelToTransform(
  page: Page,
  api: MetabaseApi,
  modelName: string,
) {
  await waitForDependencyBackfill(api);
  await waitForModelInSearch(api, modelName);
  await openMigrateModelsPage(page);
  await selectModelInTable(page, modelName);
  await openReplaceWithTransformModal(page);

  const replacement = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        "/api/ee/replacement/replace-model-with-transform",
  );
  await submitReplaceWithTransformForm(page);
  await waitForReplacementToComplete(api, await replacement);
}

// === assertions ===

/**
 * Port of the spec-local assertSourceRowsVisible. `findAllByText(string)` is an
 * EXACT testing-library match, and upstream's own `.first()` makes this
 * first-match (not the rule-3 any-of case).
 */
export async function assertSourceRowsVisible(page: Page) {
  await expect(
    main(page).getByText(SOURCE_ROW_NAME, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    main(page).getByText(SOURCE_ROW_NAME_2, { exact: true }).first(),
  ).toBeVisible();
}

/**
 * Port of the spec-local assertDataSourceIs.
 *
 * `toHaveText` normalizes whitespace, which is a no-op here — the subject is a
 * short humanized table name, never preformatted text — so nothing is
 * silently weakened by it.
 */
export async function assertDataSourceIs(page: Page, tableLabel: string) {
  await expect(page.getByTestId("data-step-cell")).toHaveText(tableLabel);
}
