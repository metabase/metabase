import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type {
  Collection,
  CollectionId,
  PythonTransformTableAliases,
  SchemaName,
  TransformId,
  TransformRun,
  TransformRunStatus,
  TransformSourceCheckpointStrategy,
  TransformTagId,
} from "metabase-types/api";

import { createTransform } from "./api";
import { getTableId } from "./e2e-qa-databases-helpers";
import { retryRequest } from "./e2e-request-helpers";

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
  return cy.request("POST", `/api/transform/${transformId}/run`);
}

export function runTransformAndWaitForStatus(
  transformId: TransformId,
  status: TransformRunStatus,
) {
  return runTransform(transformId).then(({ body: run }) => {
    return retryRequest(
      () => cy.request("GET", `/api/transform/run/${run.run_id}`),
      (response) => response.status === 200 && response.body.status === status,
    );
  });
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

export function createMbqlTransform({
  sourceTable,
  targetTable,
  targetSchema,
  tagIds,
  databaseId,
  name,
  visitTransform,
  collectionId,
}: {
  sourceTable: string;
  targetTable: string;
  targetSchema: string | null;
  tagIds?: TransformTagId[];
  name: string;
  databaseId?: number;
  visitTransform?: boolean;
  collectionId?: CollectionId | null;
}) {
  return getTableId({ databaseId, name: sourceTable }).then((tableId) => {
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
}: {
  name?: string;
  sourceQuery: string;
  targetTable: string;
  targetSchema: string;
  tagIds?: TransformTagId[];
  visitTransform?: boolean;
  sourceCheckpointStrategy?: TransformSourceCheckpointStrategy;
  wrapId?: boolean;
}) {
  return createTransform(
    {
      name,
      source: {
        type: "query",
        query: {
          database: WRITABLE_DB_ID,
          type: "native",
          native: {
            query: sourceQuery,
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
    },
    { wrapId, visitTransform },
  );
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
    cy.request("POST", `/api/transform/${transform.id}/run`);
    waitForSucceededTransformRuns();

    return cy.wrap({
      transformId: transform.id,
    });
  });
}
