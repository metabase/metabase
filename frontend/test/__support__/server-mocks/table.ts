import fetchMock from "fetch-mock";
import { Table } from "metabase-types/api";
import { setupFieldEndpoints } from "./field";

export function setupTableEndpoints(table: Table) {
  fetchMock.get(`path:/api/table/${table.id}`, table);
  fetchMock.get(`path:/api/table/${table.id}/query_metadata`, table);
  fetchMock.get(`path:/api/table/${table.id}/fks`, []);
  table.fields?.forEach(field => setupFieldEndpoints(field));

  fetchMock.put(`path:/api/table/${table.id}`, url =>
    fetchMock.lastCall(url)?.request?.json(),
  );
  fetchMock.put(`path:/api/table/${table.id}/fields/order`, []);
}

export function setupTablesEndpoints(tables: Table[]) {
  fetchMock.get("path:/api/table", tables);
  tables.forEach(table => setupTableEndpoints(table));
}
