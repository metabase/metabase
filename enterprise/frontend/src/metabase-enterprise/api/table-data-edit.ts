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
import { WritebackAction } from "metabase-types/api/actions";

export const tableDataEditApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    insertTableRows: builder.mutation<
      TableInsertRowsResponse,
      TableInsertRowsRequest
    >({
      query: ({ tableId, rows, scope }) => ({
        method: "POST",
        url: `/api/ee/data-editing/table/${tableId}`,
        body: { rows, scope },
      }),
    }),
    updateTableRows: builder.mutation<
      TableUpdateRowsResponse,
      TableUpdateRowsRequest
    >({
      query: ({ tableId, rows, scope }) => ({
        method: "PUT",
        url: `/api/ee/data-editing/table/${tableId}`,
        body: { rows, scope },
      }),
    }),
    deleteTableRows: builder.mutation<
      TableDeleteRowsResponse,
      TableDeleteRowsRequest
    >({
      query: ({ tableId, rows, scope }) => ({
        method: "POST",
        url: `/api/ee/data-editing/table/${tableId}/delete`,
        body: { rows, scope },
      }),
    }),
    tableUndo: builder.mutation<TableUndoRedoResponse, TableUndoRedoRequest>({
      query: ({ tableId, scope, noOp }) => ({
        method: "POST",
        url: `/api/ee/data-editing/undo`,
        body: { "table-id": tableId, scope, "no-op": noOp },
      }),
    }),
    tableRedo: builder.mutation<TableUndoRedoResponse, TableUndoRedoRequest>({
      query: ({ tableId, scope, noOp }) => ({
        method: "POST",
        url: `/api/ee/data-editing/redo`,
        body: { "table-id": tableId, scope, "no-op": noOp },
      }),
    }),
    getActions: builder.query<WritebackAction[], void>({
      query: () => ({
        method: "GET",
        url: `/api/ee/data-editing/tmp-action`,
      }),
      transformResponse: (response) =>
        (response as { actions: unknown[] })?.actions,
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
