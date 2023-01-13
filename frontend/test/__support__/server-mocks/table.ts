import { Scope } from "nock";
import { Table } from "metabase-types/api";
import { setupFieldEndpoints } from "./field";

export function setupTableEndpoints(scope: Scope, table: Table) {
  scope.get(`/api/table/${table.id}`).reply(200, table);
  scope.get(`/api/table/${table.id}/query_metadata`).reply(200, table);
  scope.get(`/api/table/${table.id}/fks`).reply(200, []);
  table.fields?.forEach(field => setupFieldEndpoints(scope, field));
}

export function setupTablesEndpoints(scope: Scope, tables: Table[]) {
  scope.get("/api/table").reply(200, tables);
  tables.forEach(table => setupTableEndpoints(scope, table));
}
