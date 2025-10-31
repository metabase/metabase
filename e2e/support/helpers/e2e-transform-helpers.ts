import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type {
  ListTransformRunsResponse,
  PythonTransformTableAliases,
  TransformId,
  TransformRun,
  TransformTagId,
} from "metabase-types/api";

import { createTransform } from "./api";
import { getTableId } from "./e2e-qa-databases-helpers";

export function visitTransform(transformId: TransformId) {
  cy.visit(`/admin/transforms/${transformId}`);
}

const WAIT_TIMEOUT = 10000;
const WAIT_INTERVAL = 100;

export function waitForTransformRuns(
  filter: (runs: TransformRun[]) => boolean,
  timeout = WAIT_TIMEOUT,
): Cypress.Chainable {
  return cy
    .request<ListTransformRunsResponse>("GET", "/api/ee/transform/run")
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
}: {
  sourceTable: string;
  targetTable: string;
  targetSchema: string | null;
  tagIds?: TransformTagId[];
  name: string;
  databaseId?: number;
  visitTransform?: boolean;
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
}: {
  sourceQuery: string;
  targetTable: string;
  targetSchema: string;
  tagIds?: TransformTagId[];
  visitTransform?: boolean;
}) {
  return createTransform(
    {
      name: "SQL transform",
      source: {
        type: "query",
        query: {
          database: WRITABLE_DB_ID,
          type: "native",
          native: {
            query: sourceQuery,
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
