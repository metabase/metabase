import fetchMock from "fetch-mock";

import type { ForeignKey, Table, TableId } from "metabase-types/api";

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
    `path:/api/table/${table.id}/discard_values`,
    {},
    { name: `table-${table.id}-discard-values` },
  );
  fetchMock.post(
    `path:/api/table/${table.id}/sync_schema`,
    {},
    { name: `table-${table.id}-sync-schema` },
  );
  setupTableQueryMetadataEndpoint(table);
  table.fields?.forEach((field) => setupFieldEndpoints({ ...field, table }));
}

export function setupTableQueryMetadataEndpoint(table: Table) {
  fetchMock.get(`path:/api/table/${table.id}/query_metadata`, table);
}

export function setupTableQueryMetadataEndpointError(
  tableId: TableId,
  message = "Table not found",
) {
  fetchMock.get(`path:/api/table/${tableId}/query_metadata`, {
    status: 500,
    body: message,
  });
}

export function setupTablesEndpoints(tables: Table[]) {
  fetchMock.get("path:/api/table", tables);
  tables.forEach((table) => setupTableEndpoints(table));
  setupTablesBulkEndpoints();
}

export function setupTableSearchEndpoint(tables: Table[]) {
  const name = "table-search";
  fetchMock.removeRoute(name);
  fetchMock.get({
    url: "path:/api/table?term*",
    name,
    response: (call) => {
      const url = new URL(call.url);
      const term = url.searchParams.get("term");

      // Convert wildcard pattern to regex (support * as wildcard)
      const searchPattern = term?.toLowerCase().replace(/\*/g, ".*"); // Convert \* back to .* for wildcard matching

      const regex = new RegExp(searchPattern ?? "");

      return tables.filter(
        (table) =>
          regex.test(table.name.toLowerCase()) ||
          regex.test(table.display_name?.toLowerCase() ?? ""),
      );
    },
  });
}

export function setupTablesBulkEndpoints() {
  fetchMock.post(
    "path:/api/ee/data-studio/table/rescan-values",
    {},
    { name: "tables-rescan-values" },
  );
  fetchMock.post(
    "path:/api/ee/data-studio/table/sync-schema",
    {},
    { name: "tables-sync-schema" },
  );
  fetchMock.post(
    "path:/api/ee/data-studio/table/discard-values",
    {},
    { name: "tables-discard-values" },
  );
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
