import fetchMock from "fetch-mock";
import { Table } from "metabase-types/api";
import { setupFieldEndpoints } from "./field";

export function setupTableEndpoints(table: Table) {
  fetchMock.get(`path:/api/table/${table.id}`, table);
  fetchMock.get(`path:/api/table/${table.id}/query_metadata`, table);
  fetchMock.get(`path:/api/table/${table.id}/fks`, []);
  fetchMock.post(`path:/api/table/${table.id}/rescan_values`, {});
  fetchMock.post(`path:/api/table/${table.id}/discard_values`, {});
  table.fields?.forEach(field => setupFieldEndpoints(field));
}

export function setupTablesEndpoints(tables: Table[]) {
  fetchMock.get("path:/api/table", tables);
  tables.forEach(table => setupTableEndpoints(table));
}
