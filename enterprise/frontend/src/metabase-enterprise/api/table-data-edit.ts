import type {
  TableDeleteRowsRequest,
  TableDeleteRowsResponse,
  TableInsertRowsRequest,
  TableInsertRowsResponse,
  TableUndoRedoRequest,
  TableUndoRedoResponse,
  TableUpdateRowsRequest,
  TableUpdateRowsResponse,
} from "metabase-enterprise/data_editing/tables/types";

import { EnterpriseApi } from "./api";

export const tableDataEditApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
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
        method: "POST",
        url: `/api/ee/data-editing/table/${tableId}/delete`,
        body: { rows },
      }),
    }),
    tableUndo: builder.mutation<TableUndoRedoResponse, TableUndoRedoRequest>({
      query: ({ tableId, noOp }) => ({
        method: "POST",
        url: `/api/ee/data-editing/undo`,
        body: { "table-id": tableId, "no-op": noOp },
      }),
    }),
    tableRedo: builder.mutation<TableUndoRedoResponse, TableUndoRedoRequest>({
      query: ({ tableId, noOp }) => ({
        method: "POST",
        url: `/api/ee/data-editing/redo`,
        body: { "table-id": tableId, "no-op": noOp },
      }),
    }),
  }),
});

export const {
  useInsertTableRowsMutation,
  useUpdateTableRowsMutation,
  useDeleteTableRowsMutation,
  useTableUndoMutation,
  useTableRedoMutation,
} = tableDataEditApi;
