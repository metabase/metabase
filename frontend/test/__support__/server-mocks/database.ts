import _ from "underscore";
import type { Scope } from "nock";
import type Database from "metabase-lib/metadata/Database";
import { cleanTable } from "./utils";

function setupForSingleDatabase(scope: Scope, db: Database) {
  scope.get(`/api/database/${db.id}`).reply(200, db.getPlainObject());
  scope.get(`/api/database/${db.id}/schemas`).reply(200, db.schemaNames());

  db.schemas.forEach(schema => {
    scope
      .get(`/api/database/${db.id}/schema/${schema.name}`)
      .reply(200, schema.tables.map(cleanTable));
  });
}

export function setupDatabasesEndpoints(scope: Scope, dbs: Database[]) {
  scope.get("/api/database").reply(
    200,
    dbs.map(db => db.getPlainObject()),
  );
  dbs.forEach(db => setupForSingleDatabase(scope, db));
}
