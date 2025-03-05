import type {
  TableDeleteRowsRequest,
  TableDeleteRowsResponse,
  TableInsertRowsRequest,
  TableInsertRowsResponse,
  TableUpdateRowsRequest,
  TableUpdateRowsResponse,
} from "metabase-enterprise/data_editing/tables/types";

import { EnterpriseApi } from "./api";

export const tableDataEditApi = EnterpriseApi.injectEndpoints({
  endpoints: builder => ({
    insertTableRows: builder.mutation<
      TableInsertRowsResponse,
      TableInsertRowsRequest
    >({
      query: ({ tableId, rows }) => ({
        method: "POST",
        url: `/api/ee/data-editing/table/${tableId}`,
        body: { rows },
      }),
    }),
    updateTableRows: builder.mutation<
      TableUpdateRowsResponse,
      TableUpdateRowsRequest
    >({
      query: ({ tableId, rows }) => ({
        method: "PUT",
        url: `/api/ee/data-editing/table/${tableId}`,
        body: { rows },
      }),
    }),
    deleteTableRows: builder.mutation<
      TableDeleteRowsResponse,
      TableDeleteRowsRequest
    >({
      query: ({ tableId, rows }) => ({
        method: "DELETE",
        url: `/api/ee/data-editing/table/${tableId}`,
        body: { rows },
      }),
    }),
  }),
});

export const {
  useInsertTableRowsMutation,
  useUpdateTableRowsMutation,
  useDeleteTableRowsMutation,
} = tableDataEditApi;
