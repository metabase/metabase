import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type {
  Collection,
  CollectionId,
  ListTransformJobRunsResponse,
  PythonTransformTableAliases,
  RunTransformJobResponse,
  RunTransformResponse,
  SchemaName,
  TemplateTags,
  TransformId,
  TransformJobId,
  TransformJobRunId,
  TransformRun,
  TransformRunId,
  TransformRunStatus,
  TransformSourceCheckpointStrategy,
  TransformTagId,
} from "metabase-types/api";

import { createTransform } from "./api";
import { getTableId } from "./e2e-qa-databases-helpers";
import { retryRequest } from "./e2e-request-helpers";

const TERMINAL_RUN_STATUSES = [
  "succeeded",
  "failed",
  "timeout",
  "canceled",
] as const satisfies readonly TransformRunStatus[];

type TerminalRunStatus = (typeof TERMINAL_RUN_STATUSES)[number];

const RUN_STATUS_TEXT: Record<TerminalRunStatus, RegExp> = {
  succeeded: /^Last ran .*successfully\./,
  failed: /^Last run failed/,
  timeout: /^Last run timed out/,
  canceled: /^Last run was canceled/,
};

type RunWaitOptions = {
  timeout?: number;
};

function isTerminalRunStatus(status: string | null | undefined) {
  return TERMINAL_RUN_STATUSES.some((terminal) => terminal === status);
}

export function createTransformCollection({
  name,
  parent_id = null,
}: {
  name: string;
  parent_id?: CollectionId | null;
}): Cypress.Chainable<Cypress.Response<Collection>> {
  cy.log(`Create a transform collection: ${name}`);
  return cy.request("POST", "/api/collection", {
    name,
    parent_id,
    namespace: "transforms",
  });
}

export function visitTransform(transformId: TransformId) {
  cy.visit(`/data-studio/transforms/${transformId}`);
}

export function runTransform(transformId: TransformId) {
  return cy.request<RunTransformResponse>(
    "POST",
    `/api/transform/${transformId}/run`,
  );
}

export function runTransformAndWaitForStatus(
  transformId: TransformId,
  status: TerminalRunStatus,
) {
  return runTransform(transformId).then(({ body }) =>
    waitForTransformRunStatus(body.run_id, status),
  );
}

export function runTransformAndWaitForSuccess(transformId: TransformId) {
  return runTransformAndWaitForStatus(transformId, "succeeded");
}

export function runTransformAndWaitForFailure(transformId: TransformId) {
  return runTransformAndWaitForStatus(transformId, "failed");
}

export function waitForTransformRuns(
  filter: (runs: TransformRun[]) => boolean,
) {
  return retryRequest(
    () => cy.request("GET", "/api/transform/run"),
    ({ body }) => filter(body.data),
  );
}

export function waitForSucceededTransformRuns() {
  return waitForTransformRuns((runs) =>
    runs.some((run) => run.status === "succeeded"),
  );
}

/**
 * Polls the transform run until it ends and checks that it ended with `status`, so a run that ends
 * with another status fails right away instead of exhausting the retries.
 */
export function waitForTransformRunStatus(
  runId: TransformRunId,
  status: TerminalRunStatus,
  { timeout }: RunWaitOptions = {},
) {
  return retryRequest(
    () => cy.request<TransformRun>("GET", `/api/transform/run/${runId}`),
    ({ body }) => isTerminalRunStatus(body.status),
    timeout,
  ).then(({ body }) => {
    expect(body.status, `status of transform run ${runId}`).to.eq(status);
  });
}

/**
 * Polls the job run until it ends and checks that it ended with `status`.
 */
export function waitForTransformJobRunStatus(
  jobId: TransformJobId,
  jobRunId: TransformJobRunId,
  status: TerminalRunStatus,
  { timeout }: RunWaitOptions = {},
) {
  const getJobRunStatus = ({ body }: { body: ListTransformJobRunsResponse }) =>
    body.data.find((jobRun) => jobRun.id === jobRunId)?.status;

  return retryRequest(
    () =>
      cy.request<ListTransformJobRunsResponse>(
        "GET",
        `/api/transform-job/${jobId}/runs`,
      ),
    (response) => isTerminalRunStatus(getJobRunStatus(response)),
    timeout,
  ).then((response) => {
    expect(getJobRunStatus(response), `status of job run ${jobRunId}`).to.eq(
      status,
    );
  });
}

/**
 * Clicks the run button on a transform's run page, waits until the run that this click started ends
 * with `status`, then checks that the page shows that status.
 */
export function runTransformFromUiAndWaitForStatus(
  status: TerminalRunStatus,
  options: RunWaitOptions = {},
) {
  cy.intercept("POST", "/api/transform/*/run").as("runTransformFromUi");
  getRunButton().click();
  cy.wait<unknown, RunTransformResponse>("@runTransformFromUi").then(
    ({ response }) => {
      expect(response?.statusCode).to.eq(202);
      expect(response?.body.run_id, "accepted run id").to.be.a("number");
      if (response?.body.run_id != null) {
        waitForTransformRunStatus(response.body.run_id, status, options);
      }
    },
  );
  assertRunStatusShown(status);
}

/**
 * Clicks the run button on a job page, waits until the job run that this click started ends with
 * `status`, then checks that the page shows that status.
 */
export function runTransformJobFromUiAndWaitForStatus(
  status: TerminalRunStatus,
  options: RunWaitOptions = {},
) {
  cy.intercept("POST", "/api/transform-job/*/run").as("runTransformJobFromUi");
  getRunButton().click();
  cy.wait<unknown, RunTransformJobResponse>("@runTransformJobFromUi").then(
    ({ request, response }) => {
      expect(response?.statusCode).to.eq(202);
      const jobId = getJobIdFromRunUrl(request.url);
      const jobRunId = response?.body.job_run_id;
      expect(jobRunId, "accepted job run id").to.be.a("number");
      if (jobRunId != null) {
        waitForTransformJobRunStatus(jobId, jobRunId, status, options);
      }
    },
  );
  assertRunStatusShown(status);
}

function getJobIdFromRunUrl(url: string): TransformJobId {
  const [, jobId] =
    new URL(url).pathname.match(/\/api\/transform-job\/(\d+)\/run$/) ?? [];
  return Number(jobId);
}

function getRunButton() {
  return cy.findAllByTestId("run-button").eq(0);
}

function assertRunStatusShown(status: TerminalRunStatus) {
  cy.findByTestId("run-status")
    .invoke("text")
    .should("match", RUN_STATUS_TEXT[status]);
}

export function createMbqlTransform({
  sourceTable,
  sourceSchema,
  targetTable,
  targetSchema,
  tagIds,
  databaseId,
  name,
  visitTransform,
  collectionId,
}: {
  sourceTable: string;
  sourceSchema?: string | null;
  targetTable: string;
  targetSchema: string | null;
  tagIds?: TransformTagId[];
  name: string;
  databaseId?: number;
  visitTransform?: boolean;
  collectionId?: CollectionId | null;
}) {
  return getTableId({
    databaseId,
    name: sourceTable,
    schema: sourceSchema ?? undefined,
  }).then((tableId) => {
    return createTransform(
      {
        name,
        source: {
          type: "query",
          query: {
            database: WRITABLE_DB_ID,
            type: "query",
            query: {
              "source-table": tableId,
              limit: 5,
            },
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
      },
      { visitTransform },
    );
  });
}

export function createSqlTransform({
  sourceQuery,
  targetTable,
  targetSchema,
  tagIds,
  visitTransform,
  sourceCheckpointStrategy,
  name = "SQL transform",
  wrapId = true,
  templateTags,
  tableVariableTable,
  tableVariableSchema,
  databaseId = WRITABLE_DB_ID,
}: {
  name?: string;
  sourceQuery: string;
  targetTable: string;
  targetSchema: string;
  tagIds?: TransformTagId[];
  visitTransform?: boolean;
  sourceCheckpointStrategy?: TransformSourceCheckpointStrategy;
  wrapId?: boolean;
  templateTags?: TemplateTags;
  /** When set, adds a template variable of type "table" named "table" for the given table */
  tableVariableTable?: string;
  tableVariableSchema?: string;
  databaseId?: number;
}) {
  const create = (native: {
    query: string;
    "template-tags"?: TemplateTags;
  }) => {
    return createTransform(
      {
        name,
        source: {
          type: "query",
          query: {
            database: WRITABLE_DB_ID,
            type: "native",
            native,
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
      },
      { wrapId, visitTransform },
    );
  };

  if (tableVariableTable) {
    return getTableId({
      databaseId,
      name: tableVariableTable,
      schema: tableVariableSchema,
    }).then((tableId) => {
      const resolvedTemplateTags: TemplateTags = {
        ...(templateTags ?? {}),
        table: {
          id: "table-tag-id",
          name: "table",
          "display-name": "Table",
          type: "table",
          "table-id": tableId,
        },
      };
      return create({
        query: sourceQuery,
        "template-tags": resolvedTemplateTags,
      });
    });
  }

  return create({
    query: sourceQuery,
    ...(templateTags && { "template-tags": templateTags }),
  });
}

export function createPythonTransform({
  body,
  sourceTables,
  targetTable,
  targetSchema,
  tagIds,
  visitTransform,
}: {
  body: string;
  sourceTables: PythonTransformTableAliases;
  targetTable: string;
  targetSchema: string;
  tagIds?: TransformTagId[];
  visitTransform?: boolean;
}) {
  return createTransform(
    {
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
    },
    { wrapId: true, visitTransform },
  );
}

/**
 * Creates an MBQL transform and runs it to create a table.
 * @return: information about the created transform
 */
export function createAndRunMbqlTransform({
  sourceTable,
  targetTable,
  targetSchema,
  tagIds,
  databaseId,
  name,
}: {
  sourceTable: string;
  targetTable: string;
  targetSchema: string | null;
  tagIds?: TransformTagId[];
  name?: string;
  databaseId?: number;
}): Cypress.Chainable<{
  transformId: TransformId;
}> {
  return createMbqlTransform({
    sourceTable,
    targetTable,
    targetSchema,
    tagIds,
    databaseId,
    name: name ?? "Test transform",
    visitTransform: false,
  }).then(({ body: transform }) => {
    // Run the transform
    runTransformAndWaitForSuccess(transform.id);

    return cy.wrap({
      transformId: transform.id,
    });
  });
}

/**
 * Creates a SQL transform and runs it to create a table.
 * @return: information about the created transform
 */
export function createAndRunSqlTransform({
  sourceQuery,
  targetTable,
  targetSchema,
  tagIds,
  sourceCheckpointStrategy,
  name = "Test SQL transform",
}: {
  sourceQuery: string;
  targetTable: string;
  targetSchema: SchemaName;
  tagIds?: TransformTagId[];
  sourceCheckpointStrategy?: TransformSourceCheckpointStrategy;
  name?: string;
}): Cypress.Chainable<{
  transformId: TransformId;
}> {
  return createSqlTransform({
    sourceQuery,
    targetTable,
    targetSchema,
    tagIds,
    name,
    sourceCheckpointStrategy,
    visitTransform: false,
    wrapId: false,
  }).then(({ body: transform }) => {
    runTransformAndWaitForSuccess(transform.id);

    return cy.wrap({
      transformId: transform.id,
    });
  });
}
