import type {
  Field,
  GetTableMetadataRequest,
  GetTableRequest,
  Table,
  TableId,
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
    rescanTableFieldValues: builder.mutation<void, TableId>({
      query: tableId => ({
        method: "POST",
        url: `/api/table/${tableId}/rescan_values`,
      }),
      invalidatesTags: [tag("field-values")],
    }),
    discardTableFieldValues: builder.mutation<void, TableId>({
      query: tableId => ({
        method: "POST",
        url: `/api/table/${tableId}/discard_values`,
      }),
      invalidatesTags: [tag("field-values")],
    }),
  }),
});

export const {
  useListTablesQuery,
  useGetTableQuery,
  useRescanTableFieldValuesMutation,
  useDiscardTableFieldValuesMutation,
} = tableApi;
