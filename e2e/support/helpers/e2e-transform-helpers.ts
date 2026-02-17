import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type {
  Collection,
  CollectionId,
  ListTransformRunsResponse,
  PythonTransformTableAliases,
  TransformId,
  TransformRun,
  TransformSourceCheckpointStrategy,
  TransformTagId,
} from "metabase-types/api";

import { createTransform } from "./api";
import { getTableId } from "./e2e-qa-databases-helpers";

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
  cy.request("POST", `/api/transform/${transformId}/run`);
}

const WAIT_TIMEOUT = 10000;
const WAIT_INTERVAL = 100;

export function waitForTransformRuns(
  filter: (runs: TransformRun[]) => boolean,
  timeout = WAIT_TIMEOUT,
): Cypress.Chainable {
  return cy
    .request<ListTransformRunsResponse>("GET", "/api/transform/run")
    .then((response) => {
      if (filter(response.body.data)) {
        return cy.wrap(response);
      } else if (timeout > 0) {
        cy.wait(WAIT_INTERVAL);
        return waitForTransformRuns(filter, timeout - WAIT_INTERVAL);
      } else {
        throw new Error("Run retry timeout");
      }
    });
}

export function waitForSucceededTransformRuns() {
  waitForTransformRuns(
    (runs) =>
      runs.length > 0 && runs.every((run) => run.status === "succeeded"),
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
}: {
  name?: string;
  sourceQuery: string;
  targetTable: string;
  targetSchema: string;
  tagIds?: TransformTagId[];
  visitTransform?: boolean;
  sourceCheckpointStrategy?: TransformSourceCheckpointStrategy;
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
    { wrapId: true, visitTransform },
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
    cy.request("POST", `/api/transform/${transform.id}/run`);
    // Wait for it to complete successfully
    waitForSucceededTransformRuns();

    return cy.wrap({
      transformId: transform.id,
    });
  });
}
