import fetchMock from "fetch-mock";
import _ from "underscore";

import { SAVED_QUESTIONS_DATABASE } from "metabase/databases/constants";
import { isTypeFK } from "metabase-lib/v1/types/utils/isa";
import type { Database, DatabaseUsageInfo } from "metabase-types/api";

import { PERMISSION_ERROR } from "./constants";
import { setupTableEndpoints } from "./table";

export function setupDatabaseEndpoints(db: Database) {
  fetchMock.get(`path:/api/database/${db.id}`, db);
  fetchMock.post(`path:/api/database/${db.id}/sync_schema`, {});
  fetchMock.post(`path:/api/database/${db.id}/rescan_values`, {});
  fetchMock.post(`path:/api/database/${db.id}/discard_values`, {});
  setupSchemaEndpoints(db);
  setupDatabaseIdFieldsEndpoints(db);
  db.tables?.forEach(table => setupTableEndpoints(table));

  fetchMock.put(`path:/api/database/${db.id}`, async url => {
    const call = fetchMock.lastCall(url);
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

export function setupDatabasesEndpoints(
  databases: Database[],
  { hasSavedQuestions = true } = {},
  query: object = { saved: true },
) {
  const databasesWithSavedQuestions = hasSavedQuestions
    ? [...databases, SAVED_QUESTIONS_DATABASE]
    : databases;
  fetchMock.get(
    {
      url: "path:/api/database",
      query,
      overwriteRoutes: false,
    },
    {
      data: databasesWithSavedQuestions,
      total: databasesWithSavedQuestions.length,
    },
  );
  fetchMock.get(
    { url: "path:/api/database", overwriteRoutes: false },
    { data: databases, total: databases.length },
  );
  fetchMock.post("path:/api/database", async url => {
    const lastCall = fetchMock.lastCall(url);
    return await lastCall?.request?.json();
  });

  databases.forEach(db => setupDatabaseEndpoints(db));
}

export const setupSchemaEndpoints = (db: Database) => {
  const schemas = _.groupBy(db.tables ?? [], table => table.schema);
  const schemaNames = Object.keys(schemas);
  fetchMock.get(`path:/api/database/${db.id}/schemas`, schemaNames);
  fetchMock.get(`path:/api/database/${db.id}/syncable_schemas`, schemaNames);

  schemaNames.forEach(schema => {
    fetchMock.get(
      `path:/api/database/${db.id}/schema/${schema}`,
      schemas[schema],
    );
  });
};

export function setupDatabaseIdFieldsEndpoints({ id, tables = [] }: Database) {
  const fields = tables.flatMap(table =>
    (table.fields ?? [])
      .filter(field => isTypeFK(field.semantic_type))
      .map(field => ({ ...field, table })),
  );

  fetchMock.get(`path:/api/database/${id}/idfields`, fields);
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
  dbs.forEach(db => setupUnauthorizedDatabaseEndpoints(db));
}
