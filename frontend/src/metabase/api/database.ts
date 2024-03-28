import type {
  Database,
  CreateDatabaseRequest,
  DatabaseId,
  ListDatabaseIdFieldsRequest,
  ListDatabasesRequest,
  ListDatabasesResponse,
  GetDatabaseMetadataRequest,
  GetDatabaseRequest,
  UpdateDatabaseRequest,
  Field,
} from "metabase-types/api";

import { Api } from "./api";
import { tag, idTag, listTag } from "./tags";

export const databaseApi = Api.injectEndpoints({
  endpoints: builder => ({
    listDatabases: builder.query<
      ListDatabasesResponse,
      ListDatabasesRequest | void
    >({
      query: body => ({
        method: "GET",
        url: "/api/database",
        body,
      }),
      providesTags: response => [
        listTag("database"),
        ...(response?.data?.map(({ id }) => idTag("database", id)) ?? []),
      ],
    }),
    getDatabase: builder.query<Database, GetDatabaseRequest>({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/database/${id}`,
        body,
      }),
      providesTags: (response, error, { id }) => [idTag("database", id)],
    }),
    getDatabaseMetadata: builder.query<Database, GetDatabaseMetadataRequest>({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/database/${id}/metadata`,
        body,
      }),
      providesTags: (response, error, { id }) => [
        idTag("database-metadata", id),
      ],
    }),
    listDatabaseIdFields: builder.query<Field[], ListDatabaseIdFieldsRequest>({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/database/${id}/idfields`,
        body,
      }),
      providesTags: (response, error, { id }) => [
        idTag("database-id-fields", id),
      ],
    }),
    createDatabase: builder.mutation<Database, CreateDatabaseRequest>({
      query: body => ({
        method: "POST",
        url: "/api/database",
        body,
      }),
      invalidatesTags: [listTag("database")],
    }),
    updateDatabase: builder.mutation<Database, UpdateDatabaseRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/database/${id}`,
        body,
      }),
      invalidatesTags: (response, error, { id }) => [
        listTag("database"),
        idTag("database", id),
        idTag("database-metadata", id),
        idTag("database-id-fields", id),
        tag("table"),
        tag("table-metadata"),
        tag("table-foreign-keys"),
        tag("field"),
        tag("field-values"),
      ],
    }),
    deleteDatabase: builder.mutation<void, DatabaseId>({
      query: id => ({
        method: "DELETE",
        url: `/api/database/${id}`,
      }),
      invalidatesTags: (response, error, id) => [
        listTag("database"),
        idTag("database", id),
        idTag("database-metadata", id),
        idTag("database-id-fields", id),
        tag("table"),
        tag("table-metadata"),
        tag("table-foreign-keys"),
        tag("field"),
        tag("field-values"),
      ],
    }),
    rescanDatabaseFieldValues: builder.mutation<void, DatabaseId>({
      query: databaseId => ({
        method: "POST",
        url: `/api/database/${databaseId}/rescan_values`,
      }),
      invalidatesTags: [tag("field-values")],
    }),
    discardDatabaseFieldValues: builder.mutation<void, DatabaseId>({
      query: databaseId => ({
        method: "POST",
        url: `/api/database/${databaseId}/discard_values`,
      }),
      invalidatesTags: [tag("field-values")],
    }),
  }),
});

export const {
  useListDatabasesQuery,
  useGetDatabaseQuery,
  useListDatabaseIdFieldsQuery,
  useCreateDatabaseMutation,
  useUpdateDatabaseMutation,
  useDeleteDatabaseMutation,
  useRescanDatabaseFieldValuesMutation,
  useDiscardDatabaseFieldValuesMutation,
} = databaseApi;
