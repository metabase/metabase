import fetchMock from "fetch-mock";

import type { ForeignKey, Table } from "metabase-types/api";

import { setupFieldEndpoints } from "./field";

export function setupTableEndpoints(
  table: Table,
  foreignKeys: ForeignKey[] = [],
) {
  fetchMock.get(`path:/api/table/${table.id}`, table);
  fetchMock.get(`path:/api/table/${table.id}/fks`, foreignKeys);
  fetchMock.put(
    `path:/api/table/${table.id}`,
    {},
    { name: `table-${table.id}-put` },
  );
  fetchMock.post(
    `path:/api/table/${table.id}/rescan_values`,
    {},
    { name: `table-${table.id}-rescan-values` },
  );
  fetchMock.post(
    `path:/api/table/${table.id}/sync_schema`,
    {},
    { name: `table-${table.id}-sync-schema` },
  );
  fetchMock.post(
    `path:/api/table/${table.id}/discard_values`,
    {},
    { name: `table-${table.id}-discard-values` },
  );
  setupTableQueryMetadataEndpoint(table);
  table.fields?.forEach((field) => setupFieldEndpoints({ ...field, table }));
}

export function setupTableQueryMetadataEndpoint(table: Table) {
  fetchMock.get(`path:/api/table/${table.id}/query_metadata`, table);
}

export function setupTablesEndpoints(tables: Table[]) {
  fetchMock.get("path:/api/table", tables);
  tables.forEach((table) => setupTableEndpoints(table));
}

export function setupUploadManagementEndpoint(tables: Table[]) {
  fetchMock.get("path:/api/ee/upload-management/tables", tables);
}

/**
 * mock the table deletion endpoint
 * @param failureId - the id of the table that should fail to delete, any other id will succeed
 */
export function setupDeleteUploadManagementDeleteEndpoint(failureId?: number) {
  fetchMock.delete(`glob:*/api/ee/upload-management/tables/*`, (call) => {
    return call.url.includes(`/${failureId}`)
      ? {
          throws: { data: { message: "It's dead Jim" } },
        }
      : // fetch-mock doesn't like returning true directly
        new Response(JSON.stringify(true), {
          status: 200,
        });
  });
}
