import type { TableAction, WritebackAction } from "metabase-types/api/actions";
import type {
  TableDeleteRowsRequest,
  TableDeleteRowsResponse,
  TableExecuteActionRequest,
  TableExecuteActionResponse,
  TableInsertRowsRequest,
  TableInsertRowsResponse,
  TableUndoRedoRequest,
  TableUndoRedoResponse,
  TableUpdateRowsRequest,
  TableUpdateRowsResponse,
} from "metabase-types/api/table-data-editing";

import { Api } from "./api";

const API_PATH = `/api/ee/data-editing`;

export const tableDataEditingApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    insertTableRows: builder.mutation<
      TableInsertRowsResponse,
      TableInsertRowsRequest
    >({
      query: ({ rows, scope }) => ({
        method: "POST",
        url: `${API_PATH}/action/v2/execute-bulk`,
        body: { inputs: rows, scope, action_id: "data-grid.row/create" },
      }),
    }),
    updateTableRows: builder.mutation<
      TableUpdateRowsResponse,
      TableUpdateRowsRequest
    >({
      query: ({ rows, scope }) => ({
        method: "POST",
        url: `${API_PATH}/action/v2/execute-bulk`,
        body: { inputs: rows, scope, action_id: "data-grid.row/update" },
      }),
    }),
    deleteTableRows: builder.mutation<
      TableDeleteRowsResponse,
      TableDeleteRowsRequest
    >({
      query: ({ rows, scope }) => ({
        method: "POST",
        url: `${API_PATH}/action/v2/execute-bulk`,
        body: { inputs: rows, scope, action_id: "data-grid.row/delete" },
      }),
    }),
    tableUndo: builder.mutation<TableUndoRedoResponse, TableUndoRedoRequest>({
      query: ({ tableId, scope }) => ({
        method: "POST",
        url: `${API_PATH}/action/v2/execute`,
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
        url: `${API_PATH}/action/v2/execute`,
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
        url: `${API_PATH}/tmp-action`,
      }),
      transformResponse: (response: {
        actions: Array<WritebackAction | TableAction>;
      }) => response?.actions,
    }),
    executeAction: builder.mutation<
      TableExecuteActionResponse,
      TableExecuteActionRequest
    >({
      query: ({ actionId, parameters }) => ({
        method: "POST",
        url: `${API_PATH}/action/v2/execute`,
        body: {
          input: parameters,
          // Here we pass a dummy table id, because the BE doesn't allow scope to be optional,
          // but it's not actually used for this case.
          scope: { "table-id": 1 },
          action_id: actionId,
        },
      }),
      transformResponse: (response: {
        outputs: [{ "rows-affected": number }];
      }) => {
        return response?.outputs?.[0];
      },
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
  useExecuteActionMutation,
} = tableDataEditingApi;
