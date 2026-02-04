import { updateMetadata } from "metabase/lib/redux/metadata";
import { DatabaseSchema, FieldSchema, TableSchema } from "metabase/schema";
import type {
  AutocompleteRequest,
  AutocompleteSuggestion,
  CardAutocompleteRequest,
  CardAutocompleteSuggestion,
  CheckWorkspacePermissionsRequest,
  CheckWorkspacePermissionsResponse,
  CreateDatabaseRequest,
  Database,
  DatabaseId,
  Field,
  GetDatabaseHealthResponse,
  GetDatabaseMetadataRequest,
  GetDatabaseRequest,
  GetDatabaseSettingsAvailableResponse,
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
  provideAutocompleteSuggestionListTags,
  provideCardAutocompleteSuggestionListTags,
  provideDatabaseListTags,
  provideDatabaseTags,
  tag,
} from "./tags";
import { handleQueryFulfilled } from "./utils/lifecycle";

export const databaseApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listDatabases: builder.query<
      ListDatabasesResponse,
      ListDatabasesRequest | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/database",
        params,
      }),
      providesTags: (response) => provideDatabaseListTags(response?.data ?? []),
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data.data, [DatabaseSchema])),
        ),
    }),
    getDatabase: builder.query<Database, GetDatabaseRequest>({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: `/api/database/${id}`,
        params,
      }),
      providesTags: (database) =>
        database ? provideDatabaseTags(database) : [],
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, DatabaseSchema)),
        ),
    }),
    getDatabaseHealth: builder.query<GetDatabaseHealthResponse, DatabaseId>({
      query: (id) => ({
        method: "GET",
        url: `/api/database/${id}/healthcheck`,
      }),
      // invalidate health check in the case db connection info changes
      providesTags: (_, __, id) => [idTag("database", id)],
    }),
    getDatabaseMetadata: builder.query<Database, GetDatabaseMetadataRequest>({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: `/api/database/${id}/metadata`,
        params,
      }),
      providesTags: (database) =>
        database ? provideDatabaseTags(database) : [],
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, DatabaseSchema)),
        ),
    }),
    getDatabaseSettingsAvailable: builder.query<
      GetDatabaseSettingsAvailableResponse,
      DatabaseId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/database/${id}/settings-available`,
      }),
      providesTags: (_response, _error, id) => [idTag("database", id)],
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
        ...schemas.map((schema) => idTag("schema", schema)),
      ],
    }),
    listSyncableDatabaseSchemas: builder.query<SchemaName[], DatabaseId>({
      query: (id) => ({
        method: "GET",
        url: `/api/database/${id}/syncable_schemas`,
      }),
      providesTags: (schemas = []) => [
        listTag("schema"),
        ...schemas.map((schema) => idTag("schema", schema)),
      ],
    }),
    listDatabaseSchemaTables: builder.query<
      Table[],
      ListDatabaseSchemaTablesRequest
    >({
      query: ({ id, schema, ...params }) => ({
        method: "GET",
        url: `/api/database/${id}/schema/${encodeURIComponent(schema)}`,
        params,
      }),
      providesTags: (tables = []) => [
        listTag("table"),
        ...tables.map((table) => idTag("table", table.id)),
      ],
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, [TableSchema])),
        ),
    }),
    listVirtualDatabaseTables: builder.query<
      Table[],
      ListVirtualDatabaseTablesRequest
    >({
      query: ({ id, schema, ...params }) => ({
        method: "GET",
        url: `/api/database/${id}/datasets/${encodeURIComponent(schema)}`,
        params,
      }),
      providesTags: (tables = []) => [
        listTag("table"),
        ...tables.map((table) => idTag("table", table.id)),
      ],
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, [TableSchema])),
        ),
    }),
    listDatabaseIdFields: builder.query<Field[], ListDatabaseIdFieldsRequest>({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: `/api/database/${id}/idfields`,
        params,
      }),
      providesTags: [listTag("field")],
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, [FieldSchema])),
        ),
    }),
    createDatabase: builder.mutation<Database, CreateDatabaseRequest>({
      query: (body) => ({
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
          tag("parameter-values"),
          tag("card"),
        ]),
    }),
    deleteDatabase: builder.mutation<void, DatabaseId>({
      query: (id) => ({
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
          tag("parameter-values"),
          tag("card"),
        ]),
    }),
    persistDatabase: builder.mutation<void, DatabaseId>({
      query: (id) => ({
        method: "POST",
        url: `/api/persist/database/${id}/persist`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("database", id)]),
    }),
    unpersistDatabase: builder.mutation<void, DatabaseId>({
      query: (id) => ({
        method: "POST",
        url: `/api/persist/database/${id}/unpersist`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("database", id)]),
    }),
    dismissDatabaseSyncSpinner: builder.mutation<void, DatabaseId>({
      query: (id) => ({
        method: "POST",
        url: `/api/database/${id}/dismiss_spinner`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("database"), idTag("database", id)]),
    }),
    syncDatabaseSchema: builder.mutation<void, DatabaseId>({
      query: (databaseId) => ({
        method: "POST",
        url: `/api/database/${databaseId}/sync_schema`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          tag("schema"),
          tag("table"),
          tag("field"),
          tag("field-values"),
          tag("parameter-values"),
          tag("card"),
        ]),
    }),
    rescanDatabaseFieldValues: builder.mutation<void, DatabaseId>({
      query: (databaseId) => ({
        method: "POST",
        url: `/api/database/${databaseId}/rescan_values`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("field-values"), tag("parameter-values")]),
    }),
    discardDatabaseFieldValues: builder.mutation<void, DatabaseId>({
      query: (databaseId) => ({
        method: "POST",
        url: `/api/database/${databaseId}/discard_values`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("field-values"), tag("parameter-values")]),
    }),
    checkWorkspacePermissions: builder.mutation<
      CheckWorkspacePermissionsResponse,
      CheckWorkspacePermissionsRequest
    >({
      query: ({ id, cached = true }) => ({
        method: "POST",
        url: `/api/database/${id}/permission/workspace/check`,
        body: { cached },
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("database", id)]),
    }),
    addSampleDatabase: builder.mutation<Database, void>({
      query: () => ({
        method: "POST",
        url: `/api/database/sample_database`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("database")]),
    }),
    listAutocompleteSuggestions: builder.query<
      AutocompleteSuggestion[],
      AutocompleteRequest
    >({
      query: ({ databaseId, ...params }) => ({
        method: "GET",
        url: `/api/database/${databaseId}/autocomplete_suggestions`,
        params,
      }),
      providesTags: () => provideAutocompleteSuggestionListTags(),
    }),
    listCardAutocompleteSuggestions: builder.query<
      CardAutocompleteSuggestion[],
      CardAutocompleteRequest
    >({
      query: ({ databaseId, ...params }) => ({
        method: "GET",
        url: `/api/database/${databaseId}/card_autocomplete_suggestions`,
        params,
      }),
      providesTags: () => provideCardAutocompleteSuggestionListTags(),
    }),
  }),
});

export const {
  useListDatabasesQuery,
  useLazyListDatabasesQuery,
  useGetDatabaseQuery,
  useGetDatabaseHealthQuery,
  useGetDatabaseMetadataQuery,
  useGetDatabaseSettingsAvailableQuery,
  useListDatabaseSchemasQuery,
  useLazyListDatabaseSchemasQuery,
  usePrefetch: useDatabasePrefetch,
  useListSyncableDatabaseSchemasQuery,
  useListDatabaseSchemaTablesQuery,
  useLazyListDatabaseSchemaTablesQuery,
  useListVirtualDatabaseTablesQuery,
  useListDatabaseIdFieldsQuery,
  useCreateDatabaseMutation,
  useUpdateDatabaseMutation,
  useDeleteDatabaseMutation,
  usePersistDatabaseMutation,
  useUnpersistDatabaseMutation,
  useDismissDatabaseSyncSpinnerMutation,
  useSyncDatabaseSchemaMutation,
  useRescanDatabaseFieldValuesMutation,
  useDiscardDatabaseFieldValuesMutation,
  useCheckWorkspacePermissionsMutation,
  useListAutocompleteSuggestionsQuery,
  useLazyListAutocompleteSuggestionsQuery,
  useAddSampleDatabaseMutation,
  useListCardAutocompleteSuggestionsQuery,
  useLazyListCardAutocompleteSuggestionsQuery,
} = databaseApi;
