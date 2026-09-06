/**
 * Helpers for the transforms spec port
 * (e2e/test/scenarios/data-studio/transforms/transforms.cy.spec.ts — 4,394
 * lines, the largest spec in the corpus).
 *
 * QA-DATABASE TIER. The upstream spec is `@external`: every describe restores
 * the `postgres-writable` snapshot, resets the `many_schemas` test table, and
 * drives WRITABLE_DB_ID (the writable QA postgres on :5404). It is therefore
 * gated on PW_QA_DB_ENABLED — but unlike the other QA-DB ports this one is
 * meant to EXECUTE: both the postgres and mysql sample containers plus the
 * writable snapshots exist locally. A green run with everything skipped is the
 * failure mode, not the goal (FINDINGS #49).
 *
 * New module (PORTING rule 9); shared support modules are imported read-only
 * and never edited. PORTING flags a shared `support/transforms.ts` as a wanted
 * consolidation target — this is that file, but it deliberately does NOT
 * refactor the transform helpers already living in dependency-graph.ts /
 * dependency-broken-list.ts / transforms-codegen.ts; those are imported where
 * they already do the job.
 */
import { type Locator, type Page, expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { tooltip as pageTooltip } from "./charts";
import { createTransform, runTransformAndWaitForSuccess } from "./dependency-graph";
import { WRITABLE_DB_ID, getTableId, queryWritableDB } from "./schema-viewer";
import { writableDbConfig } from "./writable-db";

export { WRITABLE_DB_ID, getTableId, createTransform, runTransformAndWaitForSuccess };

// ---------------------------------------------------------------------------
// Constants (verbatim from the spec header)
// ---------------------------------------------------------------------------

export const DB_NAME = "Writable Postgres12";
export const SOURCE_TABLE = "Animals";
export const TARGET_TABLE = "transform_table";
export const TARGET_TABLE_2 = "transform_table_2";
export const TARGET_SCHEMA = "Schema A";
export const TARGET_SCHEMA_2 = "Schema B";
export const CUSTOM_SCHEMA = "custom_schema";

export const QA_DB_SKIP_REASON =
  "Requires the writable postgres QA container + the postgres-writable snapshot (set PW_QA_DB_ENABLED)";

/** Scope-aware visible tooltip. Delegates to the canonical charts.ts helper. */
export function tooltip(page: Page): Locator {
  return pageTooltip(page).filter({ visible: true });
}

/**
 * Drop the physical tables this spec's transforms write into.
 *
 * WHY THIS EXISTS (it has no counterpart in the Cypress original). The
 * "already exists" guard the spec exercises is a **physical** check —
 * `transforms_rest/api/transform.clj:183` → `transforms_base.util/target-table-exists?`
 * → `driver/table-exists?`, i.e. describe-table against the real postgres. The
 * app-DB snapshot restore in the beforeEach resets Metabase's own state but
 * cannot touch the warehouse, and upstream's `resetTestTable("many_schemas")`
 * only drops/recreates the 26 `Animals` tables. So every transform run leaves
 * `"Schema A"."transform_table"` (and friends) behind, and the NEXT test that
 * targets the same table gets `403 A table with that name already exists.`
 *
 * Upstream tolerates this because CI provisions the writable postgres container
 * fresh per job; the local container is long-lived and shared across sessions
 * and agents, so it carries residue a CI container would not. Measured: 5 of
 * the 7 initial failures in this port were this one cause, including two
 * that surfaced as a UI modal error rather than an API status.
 *
 * This changes no assertion — it restores the clean-warehouse precondition the
 * original assumes. It is deliberately narrow (only `%transform%` tables, only
 * the schemas this spec writes to, plus the schema the "create a new schema"
 * test creates) so it cannot disturb the other QA-DB specs sharing the
 * container (`many_data_types`, `bigint_pk_table`, `scoreboard_actions`, …).
 *
 * It deliberately does NOT drop foreign SCHEMAS, even though one of them
 * (`Domestic`, from embedding-hub / interactive-embedding's `multi_schema`
 * fixture) demonstrably breaks one test here: the save-transform modal defaults
 * its Schema field to the FIRST schema of the database — measured "Domestic"
 * while the source table was "Schema A"."Animals" — so upstream's
 * `getSchemaLink().should("have.text", "Schema A")` cannot pass while that
 * schema exists. `writable_db` is shared across all five slots and three QA-DB
 * agents are live, so dropping another spec's fixture would break whoever is
 * mid-run. That test is `test.fixme`'d with the measurement instead. See
 * findings-inbox/transforms.md — this tier needs a per-slot writable DB.
 */
export async function resetTransformTargetTables() {
  await queryWritableDB(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_schema IN ('Schema A', 'Schema B', 'Domestic', 'Wild', 'public')
          AND (lower(table_name) LIKE '%transform%'
               -- the "dependencies" describe targets table_a/table_b/table_c,
               -- which the %transform% pattern does not cover; without these
               -- the second run of that test 403s on the physical
               -- already-exists check exactly as the transform_table ones did.
               OR lower(table_name) IN ('table_a', 'table_b', 'table_c'))
      LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', r.table_schema, r.table_name);
      END LOOP;
    END $$;
    DROP SCHEMA IF EXISTS ${CUSTOM_SCHEMA} CASCADE;
  `);
}

/**
 * Port of H.resetTestTable({ type: "postgres", table: "composite_pk_table" }) —
 * transcribed verbatim from `composite_pk_table` in e2e/support/test_tables.js.
 * The spec needs it for the incremental-checkpoint tests, which require a table
 * with two numeric columns (id1, score).
 *
 * `knex`/`pg` are not dependencies of this package; they resolve from the repo
 * root node_modules (the same drivers the Cypress db tasks use), so the require
 * is lazy — the module must still load with the gate off.
 */
export async function resetCompositePkTable() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Knex = require("knex") as (config: unknown) => {
    schema: {
      dropTableIfExists(name: string): Promise<unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createTable(name: string, cb: (t: any) => void): Promise<unknown>;
    };
    (table: string): { insert(rows: Record<string, unknown>[]): Promise<unknown> };
    destroy(): Promise<void>;
  };
  const client = Knex(writableDbConfig("postgres"));
  const tableName = "composite_pk_table";
  try {
    await client.schema.dropTableIfExists(tableName);
    await client.schema.createTable(tableName, (table) => {
      table.integer("id1");
      table.string("id2");
      table.string("name");
      table.integer("score");
      table.primary(["id1", "id2"]);
    });
    await client(tableName).insert([
      { id1: 1, id2: "alpha", name: "Duck", score: 10 },
      { id1: 1, id2: "beta", name: "Horse", score: 20 },
      { id1: 2, id2: "alpha", name: "Cow", score: 30 },
      { id1: 2, id2: "beta", name: "Pig", score: 40 },
      { id1: 3, id2: "alpha", name: "Chicken", score: 50 },
      { id1: 3, id2: "beta", name: "Rabbit", score: 60 },
    ]);
  } finally {
    await client.destroy();
  }
}

// ---------------------------------------------------------------------------
// Response waits (the beforeEach cy.intercept aliases — PORTING rule 2:
// register BEFORE the triggering action, await after)
// ---------------------------------------------------------------------------

type Method = "GET" | "POST" | "PUT" | "DELETE";

export function waitForApi(
  page: Page,
  method: Method,
  pathname: RegExp,
): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      pathname.test(new URL(response.url()).pathname),
  );
}

/** cy.intercept("POST", "/api/transform").as("createTransform") */
export const waitForCreateTransform = (page: Page) =>
  waitForApi(page, "POST", /^\/api\/transform$/);

/** cy.intercept("PUT", "/api/transform/*").as("updateTransform") */
export const waitForUpdateTransform = (page: Page) =>
  waitForApi(page, "PUT", /^\/api\/transform\/[^/]+$/);

/** cy.intercept("DELETE", "/api/transform/*").as("deleteTransform") */
export const waitForDeleteTransform = (page: Page) =>
  waitForApi(page, "DELETE", /^\/api\/transform\/[^/]+$/);

/** cy.intercept("DELETE", "/api/transform/*&#47;table").as("deleteTransformTable") */
export const waitForDeleteTransformTable = (page: Page) =>
  waitForApi(page, "DELETE", /^\/api\/transform\/[^/]+\/table$/);

/** cy.intercept("PUT", "/api/field/*").as("updateField") */
export const waitForUpdateField = (page: Page) =>
  waitForApi(page, "PUT", /^\/api\/field\/[^/]+$/);

/** cy.intercept("POST", "/api/transform-tag").as("createTag") */
export const waitForCreateTag = (page: Page) =>
  waitForApi(page, "POST", /^\/api\/transform-tag$/);

/** cy.intercept("PUT", "/api/transform-tag/*").as("updateTag") */
export const waitForUpdateTag = (page: Page) =>
  waitForApi(page, "PUT", /^\/api\/transform-tag\/[^/]+$/);

/** cy.intercept("DELETE", "/api/transform-tag/*").as("deleteTag") */
export const waitForDeleteTag = (page: Page) =>
  waitForApi(page, "DELETE", /^\/api\/transform-tag\/[^/]+$/);

// ---------------------------------------------------------------------------
// H.DataStudio (e2e-data-studio-helpers.ts) — the pieces this spec uses
// ---------------------------------------------------------------------------

export const DataStudio = {
  nav: (page: Page) => page.getByTestId("data-studio-nav"),
  breadcrumbs: (page: Page) => page.getByTestId("data-studio-breadcrumbs"),
  Transforms: {
    header: (page: Page) => page.getByTestId("transforms-header"),
    list: (page: Page) => page.getByTestId("transforms-list"),
    queryEditor: (page: Page) => page.getByTestId("transform-query-editor"),
    saveChangesButton: (page: Page) =>
      DataStudio.Transforms.queryEditor(page).getByRole("button", {
        name: "Save",
        exact: true,
      }),
    editTransform: (page: Page) =>
      page.getByRole("button", { name: "Edit", exact: true }),
    editDefinitionButton: (page: Page) =>
      page.getByTestId("edit-definition-button"),
    clickEditDefinition: (page: Page) =>
      DataStudio.Transforms.editDefinitionButton(page).click(),
    definitionTab: (page: Page) =>
      DataStudio.Transforms.header(page).getByText("Definition", { exact: true }),
    runTab: (page: Page) =>
      DataStudio.Transforms.header(page).getByText("Run", { exact: true }),
    inspectTab: (page: Page) =>
      DataStudio.Transforms.header(page).getByText("Inspect", { exact: true }),
    targetTab: (page: Page) =>
      DataStudio.Transforms.header(page).getByText("Target", { exact: true }),
    settingsTab: (page: Page) =>
      DataStudio.Transforms.header(page).getByText("Settings", { exact: true }),
    dependenciesTab: (page: Page) =>
      DataStudio.Transforms.header(page).getByText("Dependencies", {
        exact: true,
      }),
    visit: async (page: Page) => {
      await page.goto("/data-studio/transforms");
      await expect(DataStudio.Transforms.list(page)).toBeVisible();
    },
    visitTransform: (page: Page, transformId: number) =>
      page.goto(`/data-studio/transforms/${transformId}`),
    runButton: (page: Page) => page.getByTestId("run-button").first(),
    pythonResults: (page: Page) => page.getByTestId("python-results"),
    enableTransformPage: (page: Page) =>
      page.getByTestId("enable-transform-page"),
  },
  Jobs: {
    header: (page: Page) => page.getByTestId("jobs-header"),
    list: (page: Page) => page.getByTestId("transforms-job-list"),
    editor: (page: Page) => page.getByTestId("transforms-job-editor"),
  },
  Runs: {
    list: (page: Page) => page.getByTestId("transforms-run-list"),
    content: (page: Page) => page.getByTestId("transforms-run-content"),
    sidebar: (page: Page) => page.getByTestId("run-list-sidebar"),
  },
  Dependencies: {
    content: (page: Page) => page.getByTestId("transforms-dependencies-content"),
    graph: (page: Page) => page.getByTestId("dependency-graph"),
  },
  PythonLibrary: {
    header: (page: Page) => page.getByTestId("python-library-header"),
    editor: (page: Page) => page.getByTestId("python-editor"),
  },
};

// ---------------------------------------------------------------------------
// Spec-local getters (transforms.cy.spec.ts:3878-4188)
// ---------------------------------------------------------------------------

export async function verifyDisconnectedDatabaseBanner(page: Page) {
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(
    "The database this transform depends on has been disconnected",
  );
}

export const getTransformsNavLink = (page: Page) =>
  DataStudio.nav(page).getByRole("link", { name: "Transforms", exact: true });

export const getRunsNavLink = (page: Page) =>
  DataStudio.nav(page).getByRole("link", { name: "Runs", exact: true });

export const getTransformsList = (page: Page) =>
  page.getByTestId("transforms-list");

export const getTransformsTargetContent = (page: Page) =>
  page.getByTestId("transforms-target-content");

export const getQueryEditor = (page: Page) =>
  page.getByTestId("transform-query-editor");

/** Port of getRunButton(): findAllByTestId("run-button").eq(0). */
export const getRunButton = (page: Page) =>
  page.getByTestId("run-button").first();

export const getCancelButton = (page: Page) => page.getByTestId("cancel-button");

export const getRunStatus = (page: Page) => page.getByTestId("run-status");

export const getRunListLink = (page: Page) =>
  page.getByRole("link", { name: "See all runs", exact: true });

export const getRunErrorInfoButton = (page: Page) => page.getByLabel("See error");

/**
 * Port of getTableLink({ isActive }) — the Cypress getter carries an assertion
 * on aria-disabled, so the port asserts before handing back the locator.
 */
export async function getTableLink(
  page: Page,
  { isActive = true }: { isActive?: boolean } = {},
): Promise<Locator> {
  const link = page.getByTestId("table-link");
  await expect(link).toHaveAttribute("aria-disabled", String(!isActive));
  return link;
}

export const getDatabaseLink = (page: Page) => page.getByTestId("database-link");
export const getSchemaLink = (page: Page) => page.getByTestId("schema-link");

export const getQueryVisualization = (page: Page) =>
  page.getByTestId("query-visualization-root");

export const getSchedulePicker = (page: Page) =>
  page.getByTestId("schedule-picker");
export const getScheduleFrequencyInput = (page: Page) =>
  getSchedulePicker(page).getByLabel("Frequency", { exact: true });
/**
 * `{ exact: true }` is not decoration. testing-library's `findByLabelText`
 * defaults to an EXACT string match, Playwright's `getByLabel` to a substring
 * one — and the schedule picker also renders
 * `<div role="note" aria-label="Your Metabase timezone">`, which contains
 * "time". Measured: the loose form is a strict-mode violation resolving to the
 * time Select *and* the timezone note.
 */
export const getScheduleTimeInput = (page: Page) =>
  getSchedulePicker(page).getByLabel("Time", { exact: true });
/**
 * The real placeholder is `"For example 5   0   *   Aug   ?"` — three spaces
 * between each field (CronExpressionInput.tsx:62). Upstream writes it with
 * single spaces and still matches, because testing-library's
 * `findByPlaceholderText` runs its default normalizer (trim + collapse
 * whitespace) over the attribute value. Playwright's `getByPlaceholder` does
 * NOT normalize, so a literal transcription of upstream's string never
 * resolves. Ported as the whitespace-tolerant regex, which is what upstream's
 * matcher actually means.
 */
export const getCronInput = (page: Page) =>
  page.getByPlaceholder(/^For example 5\s+0\s+\*\s+Aug\s+\?$/);

export const getTagsInput = (page: Page) => page.getByPlaceholder("Add tags");
/** Port of getTagsInputContainer(): getTagsInput().parent(). */
export const getTagsInputContainer = (page: Page) =>
  getTagsInput(page).locator("xpath=..");

export const getFieldPicker = (page: Page) =>
  page.getByLabel("Field to check for new values");

export const getIncrementalSwitch = (page: Page) =>
  page.getByTestId("incremental-switch");

export const isIncrementalSwitchEnabled = (page: Page) =>
  expect(getIncrementalSwitch(page).getByRole("switch")).toBeChecked();
export const isIncrementalSwitchDisabled = (page: Page) =>
  expect(getIncrementalSwitch(page).getByRole("switch")).not.toBeChecked();

export const getJobTransformTable = (page: Page) =>
  page.getByLabel("Job transforms");
export const getTransformRunTable = (page: Page) =>
  page.getByLabel("Transform runs");

export const getTransformFilterWidget = (page: Page) =>
  page.getByRole("group", { name: "Transform", exact: true });
export const getStatusFilterWidget = (page: Page) =>
  page.getByRole("group", { name: "Status", exact: true });
export const getTagFilterWidget = (page: Page) =>
  page.getByRole("group", { name: "Tags", exact: true });
export const getRunMethodFilterWidget = (page: Page) =>
  page.getByRole("group", { name: "Trigger", exact: true });
export const getStartAtFilterWidget = (page: Page) =>
  page.getByRole("group", { name: "Started at", exact: true });
export const getEndAtFilterWidget = (page: Page) =>
  page.getByRole("group", { name: "Ended at", exact: true });

export const visitTransformListPage = (page: Page) =>
  page.goto("/data-studio/transforms");
export const visitJobListPage = (page: Page) =>
  page.goto("/data-studio/transforms/jobs");
export const visitRunListPage = (page: Page) =>
  page.goto("/data-studio/transforms/runs");

/** Port of getJobRow(name): the job list's row containing `name`. */
export const getJobRow = (page: Page, name: string) =>
  DataStudio.Jobs.list(page)
    .getByRole("row")
    .filter({ hasText: new RegExp(escapeRegExp(name)) });

export const openBulkActionsMenu = (page: Page) =>
  page.getByLabel("More job options").click();

/**
 * Port of runTransformAndWaitForSuccess() — the UI one (there is also an API
 * one in dependency-graph.ts, which this file re-exports). The run is
 * asynchronous; the button's own label is the completion signal, exactly as
 * upstream anchors it.
 */
export async function runTransformInUiAndWaitForSuccess(page: Page) {
  await getRunButton(page).click();
  await expect(getRunButton(page)).toHaveText("Ran successfully", {
    timeout: 60_000,
  });
}

export async function runTransformInUiAndWaitForFailure(page: Page) {
  await getRunButton(page).click();
  await expect(getRunButton(page)).toHaveText("Run failed", {
    timeout: 60_000,
  });
}

export const runJobAndWaitForSuccess = runTransformInUiAndWaitForSuccess;
export const runJobAndWaitForFailure = runTransformInUiAndWaitForFailure;

// ---------------------------------------------------------------------------
// Transform fixtures (ports of H.createMbqlTransform / createSqlTransform /
// createPythonTransform in e2e-transform-helpers.ts, wrapped by the
// spec-local defaults)
// ---------------------------------------------------------------------------

export type PythonTransformTableAliases = Array<{
  alias: string;
  table_id: number;
  database_id: number;
  schema: string;
}>;

/** Port of the spec-local createMbqlTransform() wrapper + H.createMbqlTransform. */
export async function createMbqlTransform(
  api: MetabaseApi,
  opts: {
    sourceTable?: string;
    sourceSchema?: string | null;
    targetTable?: string;
    targetSchema?: string | null;
    tagIds?: number[];
    name?: string;
    databaseId?: number;
    collectionId?: number | null;
  } = {},
): Promise<{ id: number }> {
  const {
    sourceTable = SOURCE_TABLE,
    // "Animals" exists in every schema of the many_schemas fixture, so the
    // spec pins the source schema for the default table only.
    sourceSchema = opts.sourceTable == null ? TARGET_SCHEMA : undefined,
    targetTable = TARGET_TABLE,
    targetSchema = TARGET_SCHEMA,
    tagIds,
    name = "MBQL transform",
    databaseId,
    collectionId,
  } = opts;

  const tableId = await getTableId(api, {
    databaseId,
    name: sourceTable,
    schema: sourceSchema ?? undefined,
  });

  return createTransform(api, {
    name,
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "query",
        query: { "source-table": tableId, limit: 5 },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      name: targetTable,
      schema: targetSchema,
    },
    tag_ids: tagIds,
    collection_id: collectionId,
  });
}

/** Port of the spec-local createSqlTransform() wrapper + H.createSqlTransform. */
export async function createSqlTransform(
  api: MetabaseApi,
  opts: {
    name?: string;
    sourceQuery: string;
    targetTable?: string;
    targetSchema?: string;
    tagIds?: number[];
    sourceCheckpointStrategy?: Record<string, unknown>;
    templateTags?: Record<string, unknown>;
    tableVariableTable?: string;
    tableVariableSchema?: string;
    databaseId?: number;
  },
): Promise<{ id: number }> {
  const {
    name = "SQL transform",
    sourceQuery,
    targetTable = TARGET_TABLE,
    targetSchema = TARGET_SCHEMA,
    tagIds,
    sourceCheckpointStrategy,
    templateTags,
    tableVariableTable,
    tableVariableSchema,
    databaseId = WRITABLE_DB_ID,
  } = opts;

  let resolvedTags = templateTags;
  if (tableVariableTable) {
    const tableId = await getTableId(api, {
      databaseId,
      name: tableVariableTable,
      schema: tableVariableSchema,
    });
    resolvedTags = {
      ...(templateTags ?? {}),
      table: {
        id: "table-tag-id",
        name: "table",
        "display-name": "Table",
        type: "table",
        "table-id": tableId,
      },
    };
  }

  return createTransform(api, {
    name,
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "native",
        native: {
          query: sourceQuery,
          ...(resolvedTags ? { "template-tags": resolvedTags } : {}),
        },
      },
      "source-incremental-strategy": sourceCheckpointStrategy,
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      name: targetTable,
      schema: targetSchema,
    },
    tag_ids: tagIds,
  });
}

/** Port of the spec-local createPythonTransform() wrapper + H.createPythonTransform. */
export async function createPythonTransform(
  api: MetabaseApi,
  opts: {
    body: string;
    sourceTables: PythonTransformTableAliases;
    targetTable?: string;
    targetSchema?: string;
    tagIds?: number[];
  },
): Promise<{ id: number }> {
  const {
    body,
    sourceTables,
    targetTable = TARGET_TABLE,
    targetSchema = TARGET_SCHEMA,
    tagIds,
  } = opts;

  return createTransform(api, {
    name: "Python transform",
    source: {
      type: "python",
      "source-database": WRITABLE_DB_ID,
      "source-tables": sourceTables,
      body,
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      name: targetTable,
      schema: targetSchema,
    },
    tag_ids: tagIds,
  });
}

/** Port of the spec-local pythonSourceTables(alias, tableId). */
export function pythonSourceTables(
  alias: string,
  tableId: number,
): PythonTransformTableAliases {
  return [
    {
      alias,
      table_id: tableId,
      database_id: WRITABLE_DB_ID,
      schema: TARGET_SCHEMA,
    },
  ];
}

/** Port of H.createTransformCollection (e2e-transform-helpers.ts). */
export async function createTransformCollection(
  api: MetabaseApi,
  { name, parent_id = null }: { name: string; parent_id?: number | null },
): Promise<{ id: number }> {
  const response = await api.post("/api/collection", {
    name,
    parent_id,
    namespace: "transforms",
  });
  return (await response.json()) as { id: number };
}

/** Port of H.createTransformTag (e2e/support/helpers/api/createTransformTag.ts). */
export async function createTransformTag(
  api: MetabaseApi,
  { name = "New tag" }: { name?: string } = {},
): Promise<{ id: number }> {
  const response = await api.post("/api/transform-tag", { name });
  return (await response.json()) as { id: number };
}

/**
 * Port of H.createTransformJob (e2e/support/helpers/api/createTransformJob.ts).
 * Defaults transcribed verbatim, including the six-field quartz cron.
 */
export async function createTransformJob(
  api: MetabaseApi,
  {
    name = "New transform",
    description = null,
    schedule = "0 0 0 * * ? *",
    ui_display_type = "cron/raw",
    tag_ids,
  }: {
    name?: string;
    description?: string | null;
    schedule?: string;
    ui_display_type?: string;
    tag_ids?: number[];
  } = {},
): Promise<{ id: number }> {
  const response = await api.post("/api/transform-job", {
    name,
    description,
    schedule,
    ui_display_type,
    tag_ids,
  });
  return (await response.json()) as { id: number };
}

/** Port of `cy.visit("/data-studio/transforms/jobs/:id")` — the
 * `{ visitTransformJob: true }` option on H.createTransformJob. */
export const visitTransformJob = (page: Page, jobId: number) =>
  page.goto(`/data-studio/transforms/jobs/${jobId}`);

/**
 * Port of H.waitForSucceededTransformRuns (e2e-transform-helpers.ts:71) —
 * `retryRequest(GET /api/transform/run, runs.some(status === "succeeded"))`.
 *
 * This is the schedule test's completion signal: the job fires on a
 * once-a-second cron and there is no UI event to anchor on until a run has
 * actually landed, so upstream polls the run API. Ported as a poll on the same
 * endpoint with the same predicate — not a sleep.
 */
export async function waitForSucceededTransformRuns(
  api: MetabaseApi,
  { timeout = 60_000 }: { timeout?: number } = {},
) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const response = await api.get("/api/transform/run", {
      failOnStatusCode: false,
    });
    if (response.ok()) {
      const body = (await response.json()) as {
        data: Array<{ status: string }>;
      };
      if (body.data.some((run) => run.status === "succeeded")) {
        return;
      }
    }
    if (Date.now() > deadline) {
      throw new Error(
        `waitForSucceededTransformRuns: no succeeded run after ${timeout}ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** cy.intercept("POST", "/api/transform-job").as("createJob") */
export const waitForCreateJob = (page: Page) =>
  waitForApi(page, "POST", /^\/api\/transform-job$/);

/** cy.intercept("PUT", "/api/transform-job/*").as("updateJob") — note that the
 * bulk endpoint `/api/transform-job/active` is a PUT on the same shape, so this
 * pattern deliberately excludes the literal `active` segment. */
export const waitForUpdateJob = (page: Page) =>
  waitForApi(page, "PUT", /^\/api\/transform-job\/(?!active$)[^/]+$/);

/** cy.intercept("DELETE", "/api/transform-job/*").as("deleteJob") */
export const waitForDeleteJob = (page: Page) =>
  waitForApi(page, "DELETE", /^\/api\/transform-job\/[^/]+$/);

/** cy.intercept("PUT", "/api/transform-job/active").as("bulkUpdateJobActive") */
export const waitForBulkUpdateJobActive = (page: Page) =>
  waitForApi(page, "PUT", /^\/api\/transform-job\/active$/);

/**
 * Port of `cy.wait("@alias").its("request.body").should("deep.equal", body)`.
 * Registered BEFORE the triggering action, awaited after; the returned promise
 * resolves to the parsed request body so the caller can assert on it.
 */
export function waitForApiRequestBody(
  page: Page,
  method: Method,
  pathname: RegExp,
): Promise<unknown> {
  return page
    .waitForResponse(
      (response) =>
        response.request().method() === method &&
        pathname.test(new URL(response.url()).pathname),
    )
    .then((response) => {
      const raw = response.request().postData();
      return raw == null ? undefined : JSON.parse(raw);
    });
}

/** Port of the spec-local createPythonLibrary(path, source). */
export async function createPythonLibrary(
  api: MetabaseApi,
  path: string,
  source: string,
) {
  await api.put(`/api/ee/transforms-python/library/${path}`, { source });
}

// ---------------------------------------------------------------------------
// Assertions / flows
// ---------------------------------------------------------------------------

export const getPythonDataPicker = (page: Page) =>
  page.getByTestId("python-data-picker");

/** Port of runPythonScriptAndWaitForSuccess(). */
export async function runPythonScriptAndWaitForSuccess(page: Page) {
  await getQueryEditor(page).getByTestId("run-button").click();
  await expect(
    getQueryEditor(page).getByTestId("loading-indicator"),
  ).toHaveCount(0, { timeout: 60_000 });
  await expect(DataStudio.Transforms.pythonResults(page)).toBeVisible();
}

/** Port of assertTableDoesNotExistError(). */
export async function assertTableDoesNotExistError(
  page: Page,
  {
    targetTable = TARGET_TABLE,
    targetSchema = TARGET_SCHEMA,
  }: { targetTable?: string; targetSchema?: string } = {},
) {
  await expect(
    getQueryVisualization(page).getByText(
      new RegExp(escapeRegExp(`"${targetSchema}.${targetTable}" does not exist`)),
    ),
  ).toBeVisible();
}

/** Port of assertOptionSelected(name) — the tags input shows the pill. */
export const assertOptionSelected = (page: Page, name: string) =>
  expect(
    getTagsInputContainer(page).getByText(name, { exact: true }),
  ).toBeVisible();

/** Port of assertOptionNotSelected(name). */
export const assertOptionNotSelected = (page: Page, name: string) =>
  expect(
    getTagsInputContainer(page).getByText(name, { exact: true }),
  ).toHaveCount(0);

/** Port of getRowNames(): the transform list's tree-node names, trimmed. */
export async function getRowNames(page: Page): Promise<string[]> {
  const names = await getTransformsList(page)
    .getByTestId("tree-node-name")
    .allTextContents();
  return names.map((name) => name.trim());
}

/** Port of checkSortingOrder(transformNames). */
export async function checkSortingOrder(page: Page, transformNames: string[]) {
  const table = getTransformRunTable(page);
  for (const [index, name] of transformNames.entries()) {
    await expect(
      table
        .getByText(name, { exact: true })
        .locator("xpath=ancestor::*[@data-index][1]"),
    ).toHaveAttribute("data-index", index.toString());
  }
}

// ---------------------------------------------------------------------------
// Python editor (port of H.PythonEditor = codeMirrorHelpers("python-editor"))
//
// `support/transforms-codegen.ts` already has a python CodeMirror port, but its
// focus helper is module-private and its `makeManualEdit` PASTES rather than
// types. The `python > common library` tests depend on real per-keystroke
// typing: upstream types `return a + b` with NO leading indent and asserts the
// saved value HAS four spaces, i.e. the assertion is on CodeMirror's python
// auto-indent. A paste would insert the text verbatim and make that assertion
// fail for the wrong reason, so these are typed for real.
// ---------------------------------------------------------------------------

/** Port of codeMirrorHelpers("python-editor").get(). */
export const pythonEditorContent = (page: Page) =>
  page.locator("[data-testid=python-editor] .cm-content");

/** Port of PythonEditor.focus(): click, assert cm-focused. */
export async function focusPythonEditor(page: Page) {
  await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
  const content = pythonEditorContent(page);
  await expect(content).toBeVisible();
  // Upstream clicks the RIGHT edge with { force: true } so the caret lands at
  // the end of the document. `position` is the Playwright equivalent that does
  // not need force (the content element is the click target either way).
  const box = await content.boundingBox();
  if (box) {
    await content.click({ position: { x: Math.max(box.width - 2, 1), y: 2 } });
  } else {
    await content.click();
  }
  await expect(
    page.locator("[data-testid=python-editor] .cm-editor"),
  ).toHaveClass(/cm-focused/);
}

/** Port of PythonEditor.clear(): focus + select-all + Backspace. */
export async function clearPythonEditor(page: Page) {
  await focusPythonEditor(page);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
}

/**
 * Port of PythonEditor.type(text) — the non-`allowFastSet` branch, i.e. real
 * keystrokes via cy.realType. `pressSequentially` is the equivalent; the
 * editor's auto-indent and bracket-closing run exactly as they do for a user.
 */
export async function typePythonEditor(page: Page, text: string) {
  await focusPythonEditor(page);
  await pythonEditorContent(page).pressSequentially(text);
}

/**
 * Port of PythonEditor.value(): the `.cm-line` textContents joined by newline,
 * skipping the placeholder line. NOT `toHaveText`/`innerText` — CodeMirror
 * renders each line in its own div and only this reconstruction matches
 * upstream's `should("eq", multiline)` semantics.
 */
export async function pythonEditorValue(page: Page): Promise<string> {
  return pythonEditorContent(page).evaluate((el) =>
    Array.from(el.querySelectorAll(".cm-line"))
      .filter((line) => !line.querySelector(".cm-placeholder"))
      .map((line) => line.textContent ?? "")
      .join("\n"),
  );
}

/** Port of the spec-local visitCommonLibrary(path = "common.py"). */
export const visitCommonLibrary = (page: Page, path = "common.py") =>
  page.goto(`/data-studio/transforms/library/${path}`);

/** Port of the spec-local getLibraryEditorHeader(). */
export const getLibraryEditorHeader = (page: Page) =>
  page.getByTestId("python-library-header");

/**
 * Activate a token that can CREATE python transforms, preserving upstream's
 * `pro-self-hosted` choice for CI.
 *
 * Python transform creation is gated by `python-transforms-enabled?`
 * (token_check.clj), which requires the `:transforms-basic` token feature with
 * NO non-hosted short-circuit. In CI the `pro-self-hosted` secret is a staging
 * token that carries `:transforms-basic`, so `POST /api/transform` with a
 * python source returns 200. The LOCAL `MB_PRO_SELF_HOSTED_TOKEN` predates that
 * feature (`:transforms-basic` is `^{:added "0.59.0"}`), so the same POST
 * returns **402** here — measured directly on :4107, and the same root cause
 * the permissions/incremental tests in this tree already document.
 *
 * To keep CI running on `pro-self-hosted` (the spec's token choice) while still
 * exercising the live runner locally, this activates `pro-self-hosted` first
 * and only falls back to the all-features token (`MB_ALL_FEATURES_TOKEN`, i.e.
 * the `bleeding-edge` name) when the instance reports `transforms-basic: false`.
 * In CI the fallback never fires; locally it is what makes the python tier
 * green. Documented in the spec header + findings-inbox/transforms.md.
 */
export async function activatePythonTransformToken(api: MetabaseApi) {
  await api.activateToken("pro-self-hosted");
  const response = await api.get("/api/session/properties");
  const props = (await response.json()) as {
    "token-features"?: Record<string, boolean>;
  };
  if (!props["token-features"]?.["transforms-basic"]) {
    await api.activateToken("bleeding-edge");
  }
}

/**
 * Port of `H.setPythonRunnerSettings()` (e2e-python-helpers.ts) — points the
 * instance at the python-runner on :5001 and the localstack S3 on :4566.
 */
export async function setPythonRunnerSettings(api: MetabaseApi) {
  await api.put("/api/setting", {
    "python-runner-url": "http://localhost:5001",
    "python-runner-api-token": "dev-token-12345",
    "python-storage-s-3-endpoint": "http://localhost:4566",
    "python-storage-s-3-region": "us-east-1",
    "python-storage-s-3-bucket": "metabase-python-runner",
    "python-storage-s-3-prefix": "test-prefix",
    "python-storage-s-3-access-key": "test",
    "python-storage-s-3-secret-key": "test",
    "python-storage-s-3-container-endpoint": "http://localstack:4566",
    "python-storage-s-3-path-style-access": true,
  });
}

// ---------------------------------------------------------------------------
// Collections / list-page getters used from the `collections` describe onward
// ---------------------------------------------------------------------------

/** Port of `cy.findByRole("dialog", { name: "Select a collection" })`. */
export const collectionPickerDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Select a collection" });

export const collectionPickerButton = (scope: Page | Locator) =>
  scope.getByTestId("collection-picker-button");

/**
 * Port of
 * `getTransformsList().findByText(name).closest('[role="row"]')
 *   .findByRole("button", { name: "Collection options" })`.
 */
export const collectionRowOptions = (page: Page, name: string) =>
  getTransformsList(page)
    .getByRole("row")
    .filter({ hasText: new RegExp(`^${escapeRegExp(name)}`) })
    .getByRole("button", { name: "Collection options", exact: true });

export const transformsSearchInput = (page: Page) =>
  page.getByPlaceholder("Search...");

/** Port of `H.DataStudio.Transforms.header().findByPlaceholderText("Name")`. */
export const getTransformNameInput = (page: Page) =>
  DataStudio.Transforms.header(page).getByPlaceholder("Name");

/** Port of `H.DataStudio.Transforms.header().icon("ellipsis")`. */
export const getTransformHeaderEllipsis = (page: Page) =>
  DataStudio.Transforms.header(page).locator(".Icon-ellipsis");

export const getTransformHistoryList = (page: Page) =>
  page.getByTestId("transform-history-list");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
