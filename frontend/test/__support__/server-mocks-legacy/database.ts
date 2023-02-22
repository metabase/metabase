import { Scope } from "nock";
import _ from "underscore";
import { SAVED_QUESTIONS_DATABASE } from "metabase/databases/constants";
import { Database } from "metabase-types/api";
import { setupTableEndpoints } from "./table";

export function setupDatabaseEndpoints(scope: Scope, db: Database) {
  scope.get(`/api/database/${db.id}`).reply(200, db);
  setupSchemaEndpoints(scope, db);
  db.tables?.forEach(table => setupTableEndpoints(scope, table));
}

export function setupDatabasesEndpoints(
  scope: Scope,
  dbs: Database[],
  { hasSavedQuestions = true } = {},
) {
  scope.get("/api/database").reply(200, dbs);
  scope
    .get("/api/database?saved=true")
    .reply(200, hasSavedQuestions ? [...dbs, SAVED_QUESTIONS_DATABASE] : dbs);

  dbs.forEach(db => setupDatabaseEndpoints(scope, db));
}

export const setupSchemaEndpoints = (scope: Scope, db: Database) => {
  const schemas = _.groupBy(db.tables ?? [], table => table.schema);
  const schemaNames = Object.keys(schemas);
  scope.get(`/api/database/${db.id}/schemas`).reply(200, schemaNames);

  schemaNames.forEach(schema => {
    scope
      .get(`/api/database/${db.id}/schema/${schema}`)
      .reply(200, schemas[schema]);
  });
};
