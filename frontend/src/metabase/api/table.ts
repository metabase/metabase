import { updateMetadata } from "metabase/lib/redux/metadata";
import { ForeignKeySchema, TableSchema } from "metabase/schema";
import type {
  EditTablesRequest,
  ForeignKey,
  GetTableDataRequest,
  GetTableQueryMetadataRequest,
  GetTableRequest,
  PublishModelsRequest,
  PublishModelsResponse,
  SubstituteModelRequest,
  SubstituteModelResponse,
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
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, [ForeignKeySchema])),
        ),
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
    editTables: builder.mutation<Record<string, never>, EditTablesRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/table/edit",
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
    publishModels: builder.mutation<
      PublishModelsResponse,
      PublishModelsRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/table/publish-model",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("card"), tag("collection")]),
    }),
    substituteModel: builder.mutation<
      SubstituteModelResponse,
      SubstituteModelRequest
    >({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/table/${id}/substitute-model`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("card"), tag("collection")]),
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
  useEditTablesMutation,
  useUpdateTableFieldsOrderMutation,
  useRescanTableFieldValuesMutation,
  useSyncTableSchemaMutation,
  useDiscardTableFieldValuesMutation,
  usePublishModelsMutation,
  useSubstituteModelMutation,
} = tableApi;
