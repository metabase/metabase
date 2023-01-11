import type { Scope } from "nock";
import type Table from "metabase-lib/metadata/Table";
import { setupFieldEndpoints } from "./field";
import { cleanTable } from "./utils";

function setupForSingleTable(scope: Scope, table: Table) {
  scope.get(`/api/table/${table.id}`).reply(200, cleanTable(table));

  scope.get(`/api/table/${table.id}/query_metadata`).reply(200, {
    ...cleanTable(table),
    db: table.database?.getPlainObject?.(),
    fields: table.fields.map(field => field.getPlainObject()),
  });

  scope.get(`/api/table/${table.id}/fks`).reply(200, []);

  table.fields.forEach(field => setupFieldEndpoints(scope, field));
}

export function setupTableEndpoints(scope: Scope, tables: Table[]) {
  scope.get("/api/table").reply(200, tables.map(cleanTable));
  tables.forEach(table => setupForSingleTable(scope, table));
}
