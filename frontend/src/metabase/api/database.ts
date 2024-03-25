import type { Database, DatabaseId } from "metabase-types/api";

import { Api } from "./api";
import { FIELD_VALUES_TAG } from "./tags";

export const databaseApi = Api.injectEndpoints({
  endpoints: builder => ({
    listDatabases: builder.query<Database[], void>({
      query: () => ({
        method: "GET",
        url: "/api/database",
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
  useRescanDatabaseFieldValuesMutation,
  useDiscardDatabaseFieldValuesMutation,
} = databaseApi;
