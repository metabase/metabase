import type { TableId } from "metabase-types/api";

import { Api } from "./api";

export const tableApi = Api.injectEndpoints({
  endpoints: builder => ({
    rescanTableFieldValues: builder.mutation<void, TableId>({
      query: tableId => ({
        method: "POST",
        url: `/api/table/${tableId}/rescan_values`,
      }),
    }),
    discardTableFieldValues: builder.mutation<void, TableId>({
      query: tableId => ({
        method: "POST",
        url: `/api/table/${tableId}/discard_values`,
      }),
    }),
  }),
});

export const {
  useRescanTableFieldValuesMutation,
  useDiscardTableFieldValuesMutation,
} = tableApi;
