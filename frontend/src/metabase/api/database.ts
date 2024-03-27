import type {
  Database,
  DatabaseCreateRequest,
  DatabaseId,
  DatabaseIdFieldListRequest,
  DatabaseListRequest,
  DatabaseListResponse,
  DatabaseRequest,
  DatabaseUpdateRequest,
  Field,
} from "metabase-types/api";

import { Api } from "./api";
import { tag, idTag, listTag } from "./tags";

export const databaseApi = Api.injectEndpoints({
  endpoints: builder => ({
    listDatabases: builder.query<
      DatabaseListResponse,
      DatabaseListRequest | void
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
    getDatabase: builder.query<Database, DatabaseRequest>({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/database/${id}`,
        body,
      }),
      providesTags: (response, error, { id }) => [idTag("database", id)],
    }),
    listDatabaseIdFields: builder.query<Field[], DatabaseIdFieldListRequest>({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/database/${id}/idfields`,
        body,
      }),
      providesTags: (response, error, { id }) => [
        idTag("database-id-fields", id),
      ],
    }),
    createDatabase: builder.mutation<Database, DatabaseCreateRequest>({
      query: body => ({
        method: "POST",
        url: "/api/database",
        body,
      }),
      invalidatesTags: [listTag("database")],
    }),
    updateDatabase: builder.mutation<Database, DatabaseUpdateRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/database/${id}`,
        body,
      }),
      invalidatesTags: (response, error, { id }) => [
        listTag("database"),
        idTag("database", id),
        idTag("database-id-fields", id),
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
        idTag("database-id-fields", id),
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
