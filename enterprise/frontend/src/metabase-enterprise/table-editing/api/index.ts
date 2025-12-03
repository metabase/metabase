import { EnterpriseApi } from "metabase-enterprise/api/api";

import {
  type DescribeActionFormRequest,
  type DescribeActionFormResponse,
  TableActionId,
  type TableDeleteRowsRequest,
  type TableDeleteRowsResponse,
  type TableInsertRowsRequest,
  type TableInsertRowsResponse,
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
        url: `/api/ee/action-v2/execute-bulk`,
        body: { inputs: rows, scope, action: TableActionId.CreateRow },
      }),
    }),
    updateTableRows: builder.mutation<
      TableUpdateRowsResponse,
      TableUpdateRowsRequest
    >({
      query: ({ inputs, params, scope }) => ({
        method: "POST",
        url: `/api/ee/action-v2/execute-bulk`,
        body: { inputs, params, scope, action: TableActionId.UpdateRow },
      }),
    }),
    deleteTableRows: builder.mutation<
      TableDeleteRowsResponse,
      TableDeleteRowsRequest
    >({
      query: ({ inputs, scope, params }) => ({
        method: "POST",
        url: `/api/ee/action-v2/execute-bulk`,
        body: {
          inputs,
          scope,
          action: TableActionId.DeleteRow,
          ...(params && { params }),
        },
      }),
    }),
    describeActionForm: builder.mutation<
      DescribeActionFormResponse,
      DescribeActionFormRequest
    >({
      query: (body) => ({
        method: "POST",
        url: `/api/ee/action-v2/execute-form`,
        body,
      }),
    }),
  }),
});

export const {
  useInsertTableRowsMutation,
  useUpdateTableRowsMutation,
  useDeleteTableRowsMutation,
  useDescribeActionFormMutation,
} = tableEditingApi;
