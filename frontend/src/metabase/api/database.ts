import type {
  CreateDatabaseRequest,
  Database,
  DatabaseId,
  Field,
  GetDatabaseMetadataRequest,
  GetDatabaseRequest,
  ListDatabaseIdFieldsRequest,
  ListDatabaseSchemaTablesRequest,
  ListDatabaseSchemasRequest,
  ListDatabasesRequest,
  ListDatabasesResponse,
  ListVirtualDatabaseTablesRequest,
  SchemaName,
  Table,
  UpdateDatabaseRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideDatabaseListTags,
  provideDatabaseTags,
  tag,
} from "./tags";

export const databaseApi = Api.injectEndpoints({
  endpoints: builder => ({
    listDatabases: builder.query<
      ListDatabasesResponse,
      ListDatabasesRequest | void
    >({
      query: params => ({
        method: "GET",
        url: "/api/database",
        params,
      }),
      providesTags: response => provideDatabaseListTags(response?.data ?? []),
    }),
    getDatabase: builder.query<Database, GetDatabaseRequest>({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: `/api/database/${id}`,
        params,
      }),
      providesTags: database => (database ? provideDatabaseTags(database) : []),
    }),
    getDatabaseMetadata: builder.query<Database, GetDatabaseMetadataRequest>({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: `/api/database/${id}/metadata`,
        params,
      }),
      providesTags: database => (database ? provideDatabaseTags(database) : []),
    }),
    listDatabaseSchemas: builder.query<
      SchemaName[],
      ListDatabaseSchemasRequest
    >({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: `/api/database/${id}/schemas`,
        params,
      }),
      providesTags: (schemas = []) => [
        listTag("schema"),
        ...schemas.map(schema => idTag("schema", schema)),
      ],
    }),
    listSyncableDatabaseSchemas: builder.query<SchemaName[], DatabaseId>({
      query: id => ({
        method: "GET",
        url: `/api/database/${id}/syncable_schemas`,
      }),
      providesTags: (schemas = []) => [
        listTag("schema"),
        ...schemas.map(schema => idTag("schema", schema)),
      ],
    }),
    listDatabaseSchemaTables: builder.query<
      Table[],
      ListDatabaseSchemaTablesRequest
    >({
      query: ({ id, schema, ...params }) => ({
        method: "GET",
        url: `/api/database/${id}/schema/${schema}`,
        params,
      }),
      providesTags: (tables = []) => [
        listTag("table"),
        ...tables.map(table => idTag("table", table.id)),
      ],
    }),
    listVirtualDatabaseTables: builder.query<
      Table[],
      ListVirtualDatabaseTablesRequest
    >({
      query: ({ id, schema, ...params }) => ({
        method: "GET",
        url: `/api/database/${id}/datasets/${schema}`,
        params,
      }),
      providesTags: (tables = []) => [
        listTag("table"),
        ...tables.map(table => idTag("table", table.id)),
      ],
    }),
    listDatabaseIdFields: builder.query<Field[], ListDatabaseIdFieldsRequest>({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: `/api/database/${id}/idfields`,
        params,
      }),
      providesTags: [listTag("field")],
    }),
    createDatabase: builder.mutation<Database, CreateDatabaseRequest>({
      query: body => ({
        method: "POST",
        url: "/api/database",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("database")]),
    }),
    updateDatabase: builder.mutation<Database, UpdateDatabaseRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/database/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("database"),
          idTag("database", id),
          tag("table"),
          tag("field"),
          tag("field-values"),
          tag("card"),
        ]),
    }),
    deleteDatabase: builder.mutation<void, DatabaseId>({
      query: id => ({
        method: "DELETE",
        url: `/api/database/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("database"),
          idTag("database", id),
          tag("table"),
          tag("field"),
          tag("field-values"),
          tag("card"),
        ]),
    }),
    syncDatabaseSchema: builder.mutation<void, DatabaseId>({
      query: databaseId => ({
        method: "POST",
        url: `/api/database/${databaseId}/sync_schema`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          tag("schema"),
          tag("table"),
          tag("field"),
          tag("field-values"),
          tag("card"),
        ]),
    }),
    rescanDatabaseFieldValues: builder.mutation<void, DatabaseId>({
      query: databaseId => ({
        method: "POST",
        url: `/api/database/${databaseId}/rescan_values`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("field-values")]),
    }),
    discardDatabaseFieldValues: builder.mutation<void, DatabaseId>({
      query: databaseId => ({
        method: "POST",
        url: `/api/database/${databaseId}/discard_values`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("field-values")]),
    }),
    addSampleDatabase: builder.mutation<void, Database>({
      query: () => ({
        method: "POST",
        url: `/api/database/sample_database`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("database")]),
    }),
  }),
});

export const {
  useListDatabasesQuery,
  useGetDatabaseQuery,
  useGetDatabaseMetadataQuery,
  useListDatabaseSchemasQuery,
  useListSyncableDatabaseSchemasQuery,
  useListDatabaseSchemaTablesQuery,
  useListVirtualDatabaseTablesQuery,
  useListDatabaseIdFieldsQuery,
  useCreateDatabaseMutation,
  useUpdateDatabaseMutation,
  useDeleteDatabaseMutation,
  useSyncDatabaseSchemaMutation,
  useRescanDatabaseFieldValuesMutation,
  useDiscardDatabaseFieldValuesMutation,
} = databaseApi;
