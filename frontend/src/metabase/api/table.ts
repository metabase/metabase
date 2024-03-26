import type { TableId } from "metabase-types/api";

import { Api } from "./api";
import { tag } from "./tags";

export const tableApi = Api.injectEndpoints({
  endpoints: builder => ({
    rescanTableFieldValues: builder.mutation<void, TableId>({
      query: tableId => ({
        method: "POST",
        url: `/api/table/${tableId}/rescan_values`,
      }),
      invalidatesTags: [tag("FieldValues")],
    }),
    discardTableFieldValues: builder.mutation<void, TableId>({
      query: tableId => ({
        method: "POST",
        url: `/api/table/${tableId}/discard_values`,
      }),
      invalidatesTags: [tag("FieldValues")],
    }),
  }),
});

export const {
  useRescanTableFieldValuesMutation,
  useDiscardTableFieldValuesMutation,
} = tableApi;
