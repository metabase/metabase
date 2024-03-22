import type { DatabaseId } from "metabase-types/api";

import { Api } from "./api";
import { FIELD_VALUES_LIST_TAG } from "./tags";

export const databaseApi = Api.injectEndpoints({
  endpoints: builder => ({
    rescanDatabaseFieldValues: builder.mutation<void, DatabaseId>({
      query: databaseId => ({
        method: "POST",
        url: `/api/database/${databaseId}/rescan_values`,
      }),
      invalidatesTags: [FIELD_VALUES_LIST_TAG],
    }),
    discardDatabaseFieldValues: builder.mutation<void, DatabaseId>({
      query: databaseId => ({
        method: "POST",
        url: `/api/database/${databaseId}/discard_values`,
      }),
      invalidatesTags: [FIELD_VALUES_LIST_TAG],
    }),
  }),
});

export const {
  useRescanDatabaseFieldValuesMutation,
  useDiscardDatabaseFieldValuesMutation,
} = databaseApi;
