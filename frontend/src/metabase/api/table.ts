import { updateMetadata } from "metabase/lib/redux/metadata";
import { TableSchema } from "metabase/schema";
import type {
  ForeignKey,
  GetTableDataRequest,
  GetTableQueryMetadataRequest,
  GetTableRequest,
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
  provideTableListTags,
  provideTableTags,
  tag,
} from "./tags";
import { handleQueryFulfilled } from "./utils/lifecycle";

export const tableApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listTables: builder.query<Table[], TableListQuery | void>({
      query: (params) => ({
        method: "GET",
        url: "/api/table",
        params,
      }),
      providesTags: (tables = []) => provideTableListTags(tables),
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, [TableSchema])),
        ),
    }),
    getTable: builder.query<Table, GetTableRequest>({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/table/${id}`,
      }),
      providesTags: (table) => (table ? provideTableTags(table) : []),
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, TableSchema)),
        ),
    }),
    getTableQueryMetadata: builder.query<Table, GetTableQueryMetadataRequest>({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: `/api/table/${id}/query_metadata`,
        params,
      }),
      providesTags: (table) => (table ? provideTableTags(table) : []),
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, TableSchema)),
        ),
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
        ]),
    }),
    updateTableList: builder.mutation<Table[], UpdateTableListRequest>({
      query: (body) => ({
        method: "PUT",
        url: "/api/table",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("table"), tag("database"), tag("card")]),
    }),
    updateTableFieldsOrder: builder.mutation<
      Table,
      UpdateTableFieldsOrderRequest
    >({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/table/${id}/fields/order`,
        body,
        bodyParamName: "field_order",
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          idTag("table", id),
          listTag("field"),
          tag("card"),
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
  }),
});

export const {
  useListTablesQuery,
  useGetTableQuery,
  useGetTableQueryMetadataQuery,
  useGetTableDataQuery,
  useListTableForeignKeysQuery,
  useLazyListTableForeignKeysQuery,
  useUpdateTableMutation,
  useUpdateTableListMutation,
  useUpdateTableFieldsOrderMutation,
  useRescanTableFieldValuesMutation,
  useSyncTableSchemaMutation,
  useDiscardTableFieldValuesMutation,
} = tableApi;
