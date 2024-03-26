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
import {
  tag,
  DATABASE_TAG,
  FIELD_VALUES_TAG,
  tagWithId,
  tagWithList,
} from "./tags";

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
        tagWithList(DATABASE_TAG),
        ...(response?.data?.map(({ id }) => tagWithId(DATABASE_TAG, id)) ?? []),
      ],
    }),
    getDatabase: builder.query<Database, DatabaseRequest>({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/database/${id}`,
        body,
      }),
      providesTags: (response, error, { id }) => [tagWithId(DATABASE_TAG, id)],
    }),
    createDatabase: builder.mutation<Database, DatabaseCreateRequest>({
      query: body => ({
        method: "POST",
        url: "/api/database",
        body,
      }),
      invalidatesTags: [tagWithList(DATABASE_TAG)],
    }),
    updateDatabase: builder.mutation<Database, DatabaseUpdateRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/database/${id}`,
        body,
      }),
      invalidatesTags: (response, error, { id }) => [
        tagWithList(DATABASE_TAG),
        tagWithId(DATABASE_TAG, id),
      ],
    }),
    deleteDatabase: builder.mutation<void, DatabaseId>({
      query: id => ({
        method: "DELETE",
        url: `/api/database/${id}`,
      }),
      invalidatesTags: (response, error, id) => [
        tagWithList(DATABASE_TAG),
        tagWithId(DATABASE_TAG, id),
      ],
    }),
    rescanDatabaseFieldValues: builder.mutation<void, DatabaseId>({
      query: databaseId => ({
        method: "POST",
        url: `/api/database/${databaseId}/rescan_values`,
      }),
      invalidatesTags: [tag(FIELD_VALUES_TAG)],
    }),
    discardDatabaseFieldValues: builder.mutation<void, DatabaseId>({
      query: databaseId => ({
        method: "POST",
        url: `/api/database/${databaseId}/discard_values`,
      }),
      invalidatesTags: [tag(FIELD_VALUES_TAG)],
    }),
  }),
});

export const {
  useListDatabasesQuery,
  useRescanDatabaseFieldValuesMutation,
  useDiscardDatabaseFieldValuesMutation,
} = databaseApi;
