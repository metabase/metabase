import type {
  Database,
  DatabaseCreateRequest,
  DatabaseId,
  DatabaseListRequest,
  DatabaseListResponse,
  DatabaseRequest,
  DatabaseUpdateRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { tag, tagWithId, tagWithList } from "./tags";

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
        tagWithList("Database"),
        ...(response?.data?.map(({ id }) => tagWithId("Database", id)) ?? []),
      ],
    }),
    getDatabase: builder.query<Database, DatabaseRequest>({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/database/${id}`,
        body,
      }),
      providesTags: (response, error, { id }) => [tagWithId("Database", id)],
    }),
    createDatabase: builder.mutation<Database, DatabaseCreateRequest>({
      query: body => ({
        method: "POST",
        url: "/api/database",
        body,
      }),
      invalidatesTags: [tagWithList("Database")],
    }),
    updateDatabase: builder.mutation<Database, DatabaseUpdateRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/database/${id}`,
        body,
      }),
      invalidatesTags: (response, error, { id }) => [
        tagWithList("Database"),
        tagWithId("Database", id),
      ],
    }),
    deleteDatabase: builder.mutation<void, DatabaseId>({
      query: id => ({
        method: "DELETE",
        url: `/api/database/${id}`,
      }),
      invalidatesTags: (response, error, id) => [
        tagWithList("Database"),
        tagWithId("Database", id),
      ],
    }),
    rescanDatabaseFieldValues: builder.mutation<void, DatabaseId>({
      query: databaseId => ({
        method: "POST",
        url: `/api/database/${databaseId}/rescan_values`,
      }),
      invalidatesTags: [tag("FieldValues")],
    }),
    discardDatabaseFieldValues: builder.mutation<void, DatabaseId>({
      query: databaseId => ({
        method: "POST",
        url: `/api/database/${databaseId}/discard_values`,
      }),
      invalidatesTags: [tag("FieldValues")],
    }),
  }),
});

export const {
  useListDatabasesQuery,
  useRescanDatabaseFieldValuesMutation,
  useDiscardDatabaseFieldValuesMutation,
} = databaseApi;
