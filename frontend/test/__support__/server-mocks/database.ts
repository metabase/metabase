import fetchMock from "fetch-mock";
import _ from "underscore";

import { SAVED_QUESTIONS_DATABASE } from "metabase/databases/constants";
import { isTypePK } from "metabase-lib/v1/types/utils/isa";
import type { Database, DatabaseUsageInfo } from "metabase-types/api";

import { PERMISSION_ERROR } from "./constants";
import { setupTableEndpoints } from "./table";

export function setupDatabaseEndpoints(db: Database) {
  fetchMock.get(`path:/api/database/${db.id}`, db);
  fetchMock.post(
    `path:/api/database/${db.id}/sync_schema`,
    {},
    { name: `database-${db.id}-sync-schema` },
  );
  fetchMock.post(
    `path:/api/database/${db.id}/rescan_values`,
    {},
    { name: `database-${db.id}-rescan-values` },
  );
  fetchMock.post(`path:/api/database/${db.id}/discard_values`, {});
  fetchMock.get(
    `path:/api/database/${db.id}/healthcheck`,
    {
      body: { status: "ok" },
    },
    { name: `database-${db.id}-healthcheck` },
  );
  setupSchemaEndpoints(db);
  setupDatabaseIdFieldsEndpoints({ database: db });
  db.tables?.forEach((table) => setupTableEndpoints({ ...table, db }));

  fetchMock.put(`path:/api/database/${db.id}`, async (call) => {
    const body = await call?.request?.json();
    return { ...db, ...body };
  });
}

export function setupDatabaseUsageInfoEndpoint(
  db: Database,
  usageInfo: DatabaseUsageInfo,
) {
  fetchMock.get(`path:/api/database/${db.id}/usage_info`, usageInfo);
}

export function setupDatabaseListEndpoint(databases: Database[]) {
  fetchMock.get(
    "path:/api/database",
    { data: databases, total: databases.length },
    { name: "database-list" },
  );
}

export function setupDatabasesEndpoints(
  databases: Database[],
  { hasSavedQuestions = true } = {},
  query: object = { saved: true },
) {
  const databasesWithSavedQuestions = hasSavedQuestions
    ? [...databases, SAVED_QUESTIONS_DATABASE]
    : databases;
  fetchMock.get({
    url: "path:/api/database",
    query,
    response: {
      data: databasesWithSavedQuestions,
      total: databasesWithSavedQuestions.length,
    },
    name: "database-list-with-query",
  });
  setupDatabaseListEndpoint(databases);
  fetchMock.post(
    "path:/api/database",
    async (call) => {
      return await call?.request?.json();
    },
    { name: "database-post" },
  );

  databases.forEach((db) => setupDatabaseEndpoints(db));
}

export const setupSchemaEndpoints = (db: Database) => {
  const schemas = _.groupBy(db.tables ?? [], (table) => table.schema);
  const schemaNames = Object.keys(schemas);
  fetchMock.get(`path:/api/database/${db.id}/schemas`, schemaNames);
  fetchMock.get(`path:/api/database/${db.id}/syncable_schemas`, schemaNames);

  schemaNames.forEach((schema) => {
    fetchMock.get(
      `path:/api/database/${db.id}/schema/${encodeURIComponent(schema)}`,
      schemas[schema],
      { name: `database-${db.id}-schema-${schema}` },
    );
  });
};

export function setupDatabaseIdFieldsEndpoints({
  database: { id, tables = [] },
}: {
  database: Database;
}) {
  const fields = tables.flatMap((table) =>
    (table.fields ?? [])
      .filter((field) => isTypePK(field.semantic_type))
      .map((field) => ({ ...field, table })),
  );

  const name = `database-${id}-idfields`;
  fetchMock.removeRoute(name);

  fetchMock.get(`path:/api/database/${id}/idfields`, fields, {
    name,
  });
}

export const setupUnauthorizedSchemaEndpoints = (db: Database) => {
  fetchMock.get(`path:/api/database/${db.id}/schemas`, {
    status: 403,
    body: PERMISSION_ERROR,
  });
};

export function setupUnauthorizedDatabaseEndpoints(db: Database) {
  fetchMock.get(`path:/api/database/${db.id}`, {
    status: 403,
    body: PERMISSION_ERROR,
  });

  setupUnauthorizedSchemaEndpoints(db);
}

export function setupUnauthorizedDatabasesEndpoints(dbs: Database[]) {
  dbs.forEach((db) => setupUnauthorizedDatabaseEndpoints(db));
}

export function setupDatabaseDismissSpinnerEndpoint(db: Database) {
  fetchMock.post(`path:/api/database/${db.id}/dismiss_spinner`, {
    status: 204,
  });
}
