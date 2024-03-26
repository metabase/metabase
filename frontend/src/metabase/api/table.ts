import type { TableId } from "metabase-types/api";

import { Api } from "./api";
import { FIELD_VALUES_TAG, everyTag } from "./tags";

export const tableApi = Api.injectEndpoints({
  endpoints: builder => ({
    rescanTableFieldValues: builder.mutation<void, TableId>({
      query: tableId => ({
        method: "POST",
        url: `/api/table/${tableId}/rescan_values`,
      }),
      invalidatesTags: [everyTag(FIELD_VALUES_TAG)],
    }),
    discardTableFieldValues: builder.mutation<void, TableId>({
      query: tableId => ({
        method: "POST",
        url: `/api/table/${tableId}/discard_values`,
      }),
      invalidatesTags: [everyTag(FIELD_VALUES_TAG)],
    }),
  }),
});

export const {
  useRescanTableFieldValuesMutation,
  useDiscardTableFieldValuesMutation,
} = tableApi;
