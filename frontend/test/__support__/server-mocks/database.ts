import _ from "underscore";
import type { Scope } from "nock";

import type { Table as TableObject } from "metabase-types/api";

import type Database from "metabase-lib/metadata/Database";
import type Table from "metabase-lib/metadata/Table";

function cleanTable(table: Table): TableObject {
  const object = {
    ..._.omit(table.getPlainObject(), "schema", "schema_name"),
    // After table is built inside the metadata object,
    // what is normally called "schema" is renamed to "schema_name"
    schema: table.schema_name,
  };
  return object as TableObject;
}

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
