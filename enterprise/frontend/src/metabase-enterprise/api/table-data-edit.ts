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
import type { TableAction, WritebackAction } from "metabase-types/api/actions";

import { EnterpriseApi } from "./api";

export const tableDataEditApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    insertTableRows: builder.mutation<
      TableInsertRowsResponse,
      TableInsertRowsRequest
    >({
      query: ({ rows, scope }) => ({
        method: "POST",
        url: `/api/ee/data-editing/action/v2/execute-bulk`,
        body: { inputs: rows, scope, action_id: "data-grid.row/create" },
      }),
    }),
    updateTableRows: builder.mutation<
      TableUpdateRowsResponse,
      TableUpdateRowsRequest
    >({
      query: ({ rows, scope }) => ({
        method: "POST",
        url: `/api/ee/data-editing/action/v2/execute-bulk`,
        body: { inputs: rows, scope, action_id: "data-grid.row/update" },
      }),
    }),
    deleteTableRows: builder.mutation<
      TableDeleteRowsResponse,
      TableDeleteRowsRequest
    >({
      query: ({ rows, scope }) => ({
        method: "POST",
        url: `/api/ee/data-editing/action/v2/execute-bulk`,
        body: { inputs: rows, scope, action_id: "data-grid.row/delete" },
      }),
    }),
    tableUndo: builder.mutation<TableUndoRedoResponse, TableUndoRedoRequest>({
      query: ({ tableId, scope }) => ({
        method: "POST",
        url: `/api/ee/data-editing/action/v2/execute`,
        body: {
          input: {
            "table-id": tableId,
          },
          scope,
          action_id: "data-editing/undo",
        },
      }),
    }),
    tableRedo: builder.mutation<TableUndoRedoResponse, TableUndoRedoRequest>({
      query: ({ tableId, scope }) => ({
        method: "POST",
        url: `/api/ee/data-editing/action/v2/execute`,
        body: {
          input: {
            "table-id": tableId,
          },
          scope,
          action_id: "data-editing/redo",
        },
      }),
    }),
    getActions: builder.query<Array<WritebackAction | TableAction>, void>({
      query: () => ({
        method: "GET",
        url: `/api/ee/data-editing/tmp-action`,
      }),
      transformResponse: (response: {
        actions: Array<WritebackAction | TableAction>;
      }) => response?.actions,
    }),
  }),
});

export const {
  useInsertTableRowsMutation,
  useUpdateTableRowsMutation,
  useDeleteTableRowsMutation,
  useTableUndoMutation,
  useTableRedoMutation,
  useGetActionsQuery,
} = tableDataEditApi;
