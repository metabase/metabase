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
      providesTags: (tables = []) => [
        listTag("table"),
        ...(tables.map(({ id }) => idTag("table", id)) ?? []),
      ],
    }),
    getTable: builder.query<Table, GetTableRequest>({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/table/${id}`,
      }),
      providesTags: table => (table ? [idTag("table", table.id)] : []),
    }),
    getTableMetadata: builder.query<Table, GetTableMetadataRequest>({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/table/${id}/query_metadata`,
      }),
      providesTags: (table, error, { id }) => [
        idTag("table", id),
        ...(table?.fields
          ? table.fields.flatMap(field =>
              field.id ? [idTag("field", field.id)] : [],
            )
          : []),
      ],
    }),
    listTableForeignKeys: builder.query<Field[], TableId>({
      query: id => ({
        method: "GET",
        url: `/api/table/${id}/fks`,
      }),
      providesTags: (fields = []) => [
        listTag("field"),
        ...fields.flatMap(field =>
          field.id ? [idTag("field", field.id)] : [],
        ),
      ],
    }),
    updateTable: builder.mutation<Table, UpdateTableRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/table/${id}`,
        body,
      }),
      invalidatesTags: table =>
        table ? [idTag("table", table.id), idTag("database", table.db_id)] : [],
    }),
    updateTableList: builder.mutation<Table[], UpdateTableListRequest>({
      query: body => ({
        method: "PUT",
        url: `/api/table`,
        body,
      }),
      invalidatesTags: (tables = []) =>
        tables.flatMap(table => [
          idTag("table", table.id),
          idTag("database", table.db_id),
        ]),
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
