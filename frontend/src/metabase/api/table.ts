import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";

import type {
  BulkTableRequest,
  BulkTableSelectionInfo,
  DiscardTablesValuesRequest,
  EditTablesRequest,
  ForeignKey,
  GetTableDataRequest,
  GetTableQueryMetadataRequest,
  GetTableRequest,
  RescanTablesValuesRequest,
  SyncTablesSchemaRequest,
  Table,
  TableData,
  TableId,
  TableListQuery,
  UpdateTableFieldsOrderRequest,
  UpdateTableListRequest,
  UpdateTableRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideBulkTableSelectionInfoTags,
  provideTableListTags,
  provideTableTags,
  tag,
} from "./tags";
import { rollbackOnError } from "./utils/rollback-on-error";

export const tableApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listTables: builder.query<Table[], TableListQuery | void>({
      query: (params) => ({
        method: "GET",
        url: "/api/table",
        params,
      }),
      providesTags: (tables = []) => provideTableListTags(tables),
    }),
    getTable: builder.query<Table, GetTableRequest>({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/table/${id}`,
      }),
      providesTags: (table) => (table ? provideTableTags(table) : []),
    }),
    getTableQueryMetadata: builder.query<Table, GetTableQueryMetadataRequest>({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: `/api/table/${id}/query_metadata`,
        params,
      }),
      providesTags: (table) => (table ? provideTableTags(table) : []),
    }),
    getTableData: builder.query<TableData, GetTableDataRequest>({
      query: ({ tableId }) => ({
        method: "GET",
        url: `/api/table/${tableId}/data`,
      }),
    }),
    listTableForeignKeys: builder.query<ForeignKey[], TableId>({
      query: (id) => ({
        method: "GET",
        url: `/api/table/${id}/fks`,
      }),
      providesTags: [listTag("field")],
    }),
    updateTable: builder.mutation<Table, UpdateTableRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/table/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          idTag("table", id),
          tag("database"),
          tag("card"),
          tag("dataset"),
          listTag("erd"),
        ]),
      onQueryStarted: async (
        { id, ...body },
        { dispatch, getState, queryFulfilled },
      ) => {
        const patches = selectCachedTableMetadata(getState(), [
          idTag("table", id),
        ]).map(({ originalArgs }) =>
          dispatch(
            patchCachedTableMetadata(originalArgs, (table) => {
              if (table.id === id) {
                Object.assign(table, body);
              }
            }),
          ),
        );

        await rollbackOnError(queryFulfilled, patches);
      },
    }),
    updateTableList: builder.mutation<Table[], UpdateTableListRequest>({
      query: (body) => ({
        method: "PUT",
        url: "/api/table",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          tag("table"),
          tag("database"),
          tag("card"),
          tag("dataset"),
          listTag("erd"),
        ]),
    }),
    updateTableFieldsOrder: builder.mutation<
      Table,
      UpdateTableFieldsOrderRequest
    >({
      query: ({ id, field_order }) => ({
        method: "PUT",
        url: `/api/table/${id}/fields/order`,
        body: { field_order },
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          idTag("table", id),
          listTag("field"),
          tag("card"),
          tag("dataset"),
          listTag("erd"),
        ]),
    }),
    rescanTableFieldValues: builder.mutation<void, TableId>({
      query: (id) => ({
        method: "POST",
        url: `/api/table/${id}/rescan_values`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("field-values"), tag("parameter-values")]),
    }),
    syncTableSchema: builder.mutation<void, TableId>({
      query: (id) => ({
        method: "POST",
        url: `/api/table/${id}/sync_schema`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          idTag("table", id),
          listTag("field"),
          listTag("field-values"),
          listTag("parameter-values"),
          tag("card"),
          listTag("erd"),
        ]),
    }),
    discardTableFieldValues: builder.mutation<void, TableId>({
      query: (id) => ({
        method: "POST",
        url: `/api/table/${id}/discard_values`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("field-values"), tag("parameter-values")]),
    }),
    appendTableCsv: builder.mutation<
      void,
      { tableId: TableId; formData: FormData }
    >({
      query: ({ tableId, formData }) => ({
        method: "POST",
        url: `/api/table/${tableId}/append-csv`,
        body: formData,
      }),
      invalidatesTags: (_, error, { tableId }) =>
        invalidateTags(error, [
          idTag("table", tableId),
          listTag("field"),
          listTag("field-values"),
          listTag("erd"),
        ]),
    }),
    replaceTableCsv: builder.mutation<
      void,
      { tableId: TableId; formData: FormData }
    >({
      query: ({ tableId, formData }) => ({
        method: "POST",
        url: `/api/table/${tableId}/replace-csv`,
        body: formData,
      }),
      invalidatesTags: (_, error, { tableId }) =>
        invalidateTags(error, [
          idTag("table", tableId),
          listTag("field"),
          listTag("field-values"),
          listTag("erd"),
        ]),
    }),

    /// DATA STUDIO
    getTableSelectionInfo: builder.query<
      BulkTableSelectionInfo,
      BulkTableRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/data-studio/table/selection",
        body,
      }),
      providesTags: (response) =>
        response ? provideBulkTableSelectionInfoTags(response) : [],
    }),
    editTables: builder.mutation<Record<string, never>, EditTablesRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/data-studio/table/edit",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("table"), tag("database"), tag("card")]),
    }),
    rescanTablesFieldValues: builder.mutation<void, RescanTablesValuesRequest>({
      query: (body) => ({
        method: "POST",
        url: `/api/data-studio/table/rescan-values`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("field-values"), tag("parameter-values")]),
    }),
    syncTablesSchemas: builder.mutation<void, SyncTablesSchemaRequest>({
      query: (body) => ({
        method: "POST",
        url: `/api/data-studio/table/sync-schema`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          tag("table"),
          listTag("field"),
          listTag("field-values"),
          listTag("parameter-values"),
          tag("card"),
        ]),
    }),
    discardTablesFieldValues: builder.mutation<
      void,
      DiscardTablesValuesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: `/api/data-studio/table/discard-values`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("field-values"), tag("parameter-values")]),
    }),
  }),
});

export const {
  useListTablesQuery,
  useGetTableQuery,
  useGetTableQueryMetadataQuery,
  useLazyGetTableQueryMetadataQuery,
  useGetTableDataQuery,
  useListTableForeignKeysQuery,
  useLazyListTableForeignKeysQuery,
  useUpdateTableMutation,
  useUpdateTableListMutation,
  useUpdateTableFieldsOrderMutation,
  useRescanTableFieldValuesMutation,
  useSyncTableSchemaMutation,
  useDiscardTableFieldValuesMutation,
  useAppendTableCsvMutation,
  useReplaceTableCsvMutation,

  useGetTableSelectionInfoQuery,
  useLazyGetTableSelectionInfoQuery,
  useEditTablesMutation,
  useRescanTablesFieldValuesMutation,
  useSyncTablesSchemasMutation,
  useDiscardTablesFieldValuesMutation,
} = tableApi;

/**
 * Reads a table's already-fetched `query_metadata` out of the RTK cache. Use it
 * after awaiting the fetch, where a hook is not an option.
 */
export const selectTableQueryMetadata =
  tableApi.endpoints.getTableQueryMetadata.select;

/**
 * Fetches metadata for all foreign tables referenced by the given table's foreign key fields.
 * Dispatches queries to load metadata for each related table.
 *
 * @param table - The table containing foreign key fields
 * @param params - Optional parameters to pass to the metadata query (excluding 'id')
 * @returns A thunk function that dispatches metadata fetch actions for all foreign tables
 */
export const fetchForeignTablesMetadata = (
  table: Table,
  params?: Omit<GetTableQueryMetadataRequest, "id">,
) => {
  return (dispatch: (action: unknown) => void) => {
    const fkTableIds = new Set<TableId>();
    for (const field of table.fields ?? []) {
      if (field.target?.table_id != null) {
        fkTableIds.add(field.target.table_id);
      }
    }

    fkTableIds.forEach((id) =>
      dispatch(
        tableApi.endpoints.getTableQueryMetadata.initiate({ id, ...params }),
      ),
    );
  };
};

export type TableMetadataPatch = {
  undo: () => void;
};

/**
 * `updateQueryData` is generic over every endpoint in this file, and TypeScript
 * can only instantiate that from inside the `injectEndpoints` call above
 * (TS2589 anywhere else). Pinning the single endpoint we patch keeps the call
 * sites, including the one in `field.ts`, fully checked.
 */
export const patchCachedTableMetadata = tableApi.util.updateQueryData.bind(
  null,
  "getTableQueryMetadata",
) as (
  args: GetTableQueryMetadataRequest,
  recipe: (table: Table) => void,
) => ThunkAction<TableMetadataPatch, unknown, unknown, UnknownAction>;

export function selectCachedTableMetadata(
  state: Parameters<typeof tableApi.util.selectInvalidatedBy>[0],
  tags: Parameters<typeof tableApi.util.selectInvalidatedBy>[1],
) {
  return tableApi.util
    .selectInvalidatedBy(state, tags)
    .filter(({ endpointName }) => endpointName === "getTableQueryMetadata");
}
