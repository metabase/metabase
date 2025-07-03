import type { SkipToken } from "@reduxjs/toolkit/query";

import type {
  ConfigFormRequest,
  ConfigFormResponse,
  DescribeActionFormRequest,
  DescribeActionFormResponse,
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
} from "metabase-enterprise/data_editing/tables/types";
import type { DataGridWritebackAction } from "metabase-types/api/actions";

import { EnterpriseApi } from "./api";

export const tableDataEditApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    insertTableRows: builder.mutation<
      TableInsertRowsResponse,
      TableInsertRowsRequest
    >({
      query: ({ rows, scope }) => ({
        method: "POST",
        url: `/api/action/v2/execute-bulk`,
        body: { inputs: rows, scope, action_id: "data-grid.row/create" },
      }),
    }),
    updateTableRows: builder.mutation<
      TableUpdateRowsResponse,
      TableUpdateRowsRequest
    >({
      query: ({ inputs, params, scope }) => ({
        method: "POST",
        url: `/api/action/v2/execute-bulk`,
        body: { inputs, params, scope, action_id: "data-grid.row/update" },
      }),
    }),
    deleteTableRows: builder.mutation<
      TableDeleteRowsResponse,
      TableDeleteRowsRequest
    >({
      query: ({ rows, scope, params }) => ({
        method: "POST",
        url: `/api/action/v2/execute-bulk`,
        body: {
          inputs: rows,
          scope,
          action_id: "data-grid.row/delete",
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
          action_id: "data-editing/undo",
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
          action_id: "data-editing/redo",
        },
      }),
    }),
    getActions: builder.query<
      DataGridWritebackAction[],
      null | SkipToken | void
    >({
      query: (params) => ({
        method: "GET",
        url: `/api/action/v2/tmp-action`,
        params,
      }),
      transformResponse: (response: { actions: DataGridWritebackAction[] }) =>
        response?.actions,
    }),
    executeAction: builder.mutation<
      TableExecuteActionResponse,
      TableExecuteActionRequest
    >({
      query: ({ actionId, scope, input, params }) => ({
        method: "POST",
        url: `/api/action/v2/execute`,
        body: {
          input,
          params,
          scope,
          action_id: actionId,
        },
      }),
      transformResponse: (response: {
        outputs: [{ "rows-affected": number }];
      }) => {
        return response?.outputs?.[0];
      },
    }),
    describeActionForm: builder.mutation<
      DescribeActionFormResponse,
      DescribeActionFormRequest
    >({
      query: (body) => ({
        method: "POST",
        url: `/api/action/v2/tmp-modal`,
        body,
      }),
    }),
    configureActionForm: builder.mutation<
      ConfigFormResponse,
      ConfigFormRequest
    >({
      query: (body) => ({
        method: "POST",
        url: `/api/action/v2/config-form`,
        body,
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
  useGetActionsQuery,
  useExecuteActionMutation,
  useDescribeActionFormMutation,
  useConfigureActionFormMutation,
} = tableDataEditApi;
