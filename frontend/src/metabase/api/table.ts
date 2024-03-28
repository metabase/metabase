import type {
  Field,
  GetTableMetadataRequest,
  GetTableRequest,
  Table,
  TableId,
  UpdateTableListRequest,
  UpdateTableRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, listTag, tag } from "./tags";

export const tableApi = Api.injectEndpoints({
  endpoints: builder => ({
    listTables: builder.query<Table[], void>({
      query: () => ({
        method: "GET",
        url: "/api/table",
      }),
      providesTags: response => [
        listTag("table"),
        ...(response?.map(({ id }) => idTag("table", id)) ?? []),
      ],
    }),
    getTable: builder.query<Table, GetTableRequest>({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/table/${id}`,
      }),
      providesTags: (response, error, { id }) => [idTag("table", id)],
    }),
    getTableMetadata: builder.query<Table, GetTableMetadataRequest>({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/table/${id}/query_metadata`,
      }),
      providesTags: (response, error, { id }) => [idTag("table-metadata", id)],
    }),
    listTableForeignKeys: builder.query<Field[], TableId>({
      query: id => ({
        method: "GET",
        url: `/api/table/${id}/fks`,
      }),
      providesTags: (response, error, id) => [idTag("table-foreign-keys", id)],
    }),
    updateTable: builder.mutation<Table, UpdateTableRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/table/${id}`,
        body,
      }),
      invalidatesTags: (response, error, { id }) => [
        idTag("table", id),
        idTag("table-metadata", id),
        tag("database-metadata"),
      ],
    }),
    updateTableList: builder.mutation<Table[], UpdateTableListRequest>({
      query: body => ({
        method: "PUT",
        url: `/api/table`,
        body,
      }),
      invalidatesTags: (response, error, { ids }) => [
        ...ids.map(id => idTag("table", id)),
        ...ids.map(id => idTag("table-metadata", id)),
        tag("database-metadata"),
      ],
    }),
    rescanTableFieldValues: builder.mutation<void, TableId>({
      query: id => ({
        method: "POST",
        url: `/api/table/${id}/rescan_values`,
      }),
      invalidatesTags: [tag("field-values")],
    }),
    discardTableFieldValues: builder.mutation<void, TableId>({
      query: id => ({
        method: "POST",
        url: `/api/table/${id}/discard_values`,
      }),
      invalidatesTags: [tag("field-values")],
    }),
  }),
});

export const {
  useListTablesQuery,
  useGetTableQuery,
  useGetTableMetadataQuery,
  useLazyListTableForeignKeysQuery,
  useUpdateTableMutation,
  useUpdateTableListMutation,
  useRescanTableFieldValuesMutation,
  useDiscardTableFieldValuesMutation,
} = tableApi;
