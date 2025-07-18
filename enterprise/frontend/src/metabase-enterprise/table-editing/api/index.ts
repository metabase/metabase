import { EnterpriseApi } from "metabase-enterprise/api/api";

import {
  TableActionId,
  type TableDeleteRowsRequest,
  type TableDeleteRowsResponse,
  type TableInsertRowsRequest,
  type TableInsertRowsResponse,
  type TableUndoRedoRequest,
  type TableUndoRedoResponse,
  type TableUpdateRowsRequest,
  type TableUpdateRowsResponse,
} from "./types";

export const tableEditingApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    insertTableRows: builder.mutation<
      TableInsertRowsResponse,
      TableInsertRowsRequest
    >({
      query: ({ rows, scope }) => ({
        method: "POST",
        url: `/api/action/v2/execute-bulk`,
        body: { inputs: rows, scope, action_id: TableActionId.CreateRow },
      }),
    }),
    updateTableRows: builder.mutation<
      TableUpdateRowsResponse,
      TableUpdateRowsRequest
    >({
      query: ({ inputs, params, scope }) => ({
        method: "POST",
        url: `/api/action/v2/execute-bulk`,
        body: { inputs, params, scope, action_id: TableActionId.UpdateRow },
      }),
    }),
    deleteTableRows: builder.mutation<
      TableDeleteRowsResponse,
      TableDeleteRowsRequest
    >({
      query: ({ inputs, scope, params }) => ({
        method: "POST",
        url: `/api/action/v2/execute-bulk`,
        body: {
          inputs,
          scope,
          action_id: TableActionId.DeleteRow,
          ...(params && { params }),
        },
      }),
    }),
    tableUndo: builder.mutation<TableUndoRedoResponse, TableUndoRedoRequest>({
      query: ({ tableId, scope }) => ({
        method: "POST",
        url: `/api/action/v2/execute`,
        body: {
          input: {
            "table-id": tableId,
          },
          scope,
          action_id: TableActionId.Undo,
        },
      }),
    }),
    tableRedo: builder.mutation<TableUndoRedoResponse, TableUndoRedoRequest>({
      query: ({ tableId, scope }) => ({
        method: "POST",
        url: `/api/action/v2/execute`,
        body: {
          input: {
            "table-id": tableId,
          },
          scope,
          action_id: TableActionId.Redo,
        },
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
} = tableEditingApi;
