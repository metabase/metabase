import fetchMock from "fetch-mock";
import _ from "underscore";
import { SAVED_QUESTIONS_DATABASE } from "metabase/databases/constants";
import { Database } from "metabase-types/api";
import { setupTableEndpoints } from "./table";

export function setupDatabaseEndpoints(db: Database) {
  fetchMock.get(`path:/api/database/${db.id}`, db);
  setupSchemaEndpoints(db);
  db.tables?.forEach(table => setupTableEndpoints(table));
}

export function setupDatabasesEndpoints(
  dbs: Database[],
  { hasSavedQuestions = true } = {},
) {
  fetchMock.get("path:/api/database", dbs);
  fetchMock.get(
    "path:/api/database?saved=true",
    hasSavedQuestions ? [...dbs, SAVED_QUESTIONS_DATABASE] : dbs,
  );

  dbs.forEach(db => setupDatabaseEndpoints(db));
}

export const setupSchemaEndpoints = (db: Database) => {
  const schemas = _.groupBy(db.tables ?? [], table => table.schema);
  const schemaNames = Object.keys(schemas);
  fetchMock.get(`path:/api/database/${db.id}/schemas`, schemaNames);

  schemaNames.forEach(schema => {
    fetchMock.get(
      `path:/api/database/${db.id}/schema/${schema}`,
      schemas[schema],
    );
  });
};
