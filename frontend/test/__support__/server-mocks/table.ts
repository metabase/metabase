import fetchMock from "fetch-mock";

import type { ForeignKey, Table } from "metabase-types/api";

import { setupFieldEndpoints } from "./field";

export function setupTableEndpoints(
  table: Table,
  foreignKeys: ForeignKey[] = [],
) {
  fetchMock.get(`path:/api/table/${table.id}`, table);
  fetchMock.get(`path:/api/table/${table.id}/fks`, foreignKeys);
  fetchMock.post(`path:/api/table/${table.id}/rescan_values`, {});
  fetchMock.post(`path:/api/table/${table.id}/discard_values`, {});
  setupTableQueryMetadataEndpoint(table);
  table.fields?.forEach(field => setupFieldEndpoints(field));
}

export function setupTableQueryMetadataEndpoint(table: Table) {
  fetchMock.get(`path:/api/table/${table.id}/query_metadata`, table);
}

export function setupTablesEndpoints(tables: Table[]) {
  fetchMock.get("path:/api/table", tables);
  tables.forEach(table => setupTableEndpoints(table));
}

export function setupUploadManagementEndpoint(tables: Table[]) {
  fetchMock.get("path:/api/ee/upload-management/tables", tables);
}

/**
 * mock the table deletion endpoint
 * @param failureId - the id of the table that should fail to delete, any other id will succeed
 */
export function setupDeleteUploadManagementDeleteEndpoint(failureId?: number) {
  fetchMock.delete(`glob:*/api/ee/upload-management/tables/*`, url => {
    return url.includes(`/${failureId}`)
      ? {
          throws: { data: { message: "It's dead Jim" } },
        }
      : true;
  });
}
