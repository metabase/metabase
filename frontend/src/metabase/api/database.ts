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
import { FIELD_VALUES_TAG } from "./tags";

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
    }),
    getDatabase: builder.query<Database, DatabaseRequest>({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/database/${id}`,
        body,
      }),
    }),
    createDatabase: builder.mutation<Database, DatabaseCreateRequest>({
      query: body => ({
        method: "POST",
        url: "/api/database/",
        body,
      }),
    }),
    updateDatabase: builder.mutation<Database, DatabaseUpdateRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/database/${id}`,
        body,
      }),
    }),
    deleteDatabase: builder.mutation<void, DatabaseId>({
      query: id => ({
        method: "DELETE",
        url: `/api/database/${id}`,
      }),
    }),
    rescanDatabaseFieldValues: builder.mutation<void, DatabaseId>({
      query: databaseId => ({
        method: "POST",
        url: `/api/database/${databaseId}/rescan_values`,
      }),
      invalidatesTags: [FIELD_VALUES_TAG],
    }),
    discardDatabaseFieldValues: builder.mutation<void, DatabaseId>({
      query: databaseId => ({
        method: "POST",
        url: `/api/database/${databaseId}/discard_values`,
      }),
      invalidatesTags: [FIELD_VALUES_TAG],
    }),
  }),
});

export const {
  useListDatabasesQuery,
  useRescanDatabaseFieldValuesMutation,
  useDiscardDatabaseFieldValuesMutation,
} = databaseApi;
