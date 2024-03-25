import type {
  DatabaseId,
  DatabaseListInput,
  DatabaseListResult,
} from "metabase-types/api";

import { Api } from "./api";
import { FIELD_VALUES_TAG } from "./tags";

export const databaseApi = Api.injectEndpoints({
  endpoints: builder => ({
    getDatabases: builder.query<DatabaseListResult, DatabaseListInput | void>({
      query: input => ({
        method: "GET",
        url: "/api/database",
        body: input,
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
  useGetDatabasesQuery,
  useRescanDatabaseFieldValuesMutation,
  useDiscardDatabaseFieldValuesMutation,
} = databaseApi;
