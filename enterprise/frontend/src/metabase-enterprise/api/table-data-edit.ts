import { tableApi } from "metabase/api";
import type {
  TableDeleteRowsRequest,
  TableDeleteRowsResponse,
  TableInsertRowsRequest,
  TableInsertRowsResponse,
  TableUpdateRowsRequest,
  TableUpdateRowsResponse,
} from "metabase-enterprise/data_editing/tables/types";
import type { DatasetColumn, RowValue } from "metabase-types/api";

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
      onQueryStarted: async ({ tableId }, { dispatch, queryFulfilled }) => {
        const { data: response } = await queryFulfilled;

        dispatch(
          tableApi.util.updateQueryData(
            "getTableData",
            { tableId },
            ({ data }) => {
              const createdRows = mapRowObjectsToRowValuesArray(
                response["created-rows"],
                data.cols,
              );

              data.rows.push(...createdRows);
            },
          ),
        );
      },
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
      onQueryStarted: async (
        { primaryKeyColumnName, tableId },
        { dispatch, queryFulfilled },
      ) => {
        const { data: response } = await queryFulfilled;

        dispatch(
          tableApi.util.updateQueryData(
            "getTableData",
            { tableId },
            ({ data }) => {
              const updatedRows = mapRowObjectsToRowValuesArray(
                response.updated,
                data.cols,
              );

              const primaryKeyIndex = pkColumnNameToPkColumnIndex(
                primaryKeyColumnName,
                data.cols,
              );

              for (const row of data.rows) {
                for (const updatedRow of updatedRows) {
                  if (row[primaryKeyIndex] === updatedRow[primaryKeyIndex]) {
                    // Update row values array with updated values
                    for (let i = 0; i < data.cols.length; i++) {
                      row[i] = updatedRow[i];
                    }
                  }
                }
              }
            },
          ),
        );
      },
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
      onQueryStarted: async (
        { tableId, primaryKeyColumnName, rows },
        { dispatch, queryFulfilled },
      ) => {
        const { data: response } = await queryFulfilled;

        if (response.success) {
          dispatch(
            tableApi.util.updateQueryData(
              "getTableData",
              { tableId },
              ({ data }) => {
                const deletedKeys = rows.map(
                  (row) => row[primaryKeyColumnName],
                );
                const primaryKeyIndex = pkColumnNameToPkColumnIndex(
                  primaryKeyColumnName,
                  data.cols,
                );

                data.rows = data.rows.filter(
                  (row) => !deletedKeys.includes(row[primaryKeyIndex]),
                );
              },
            ),
          );
        }
      },
    }),
  }),
});

function mapRowObjectsToRowValuesArray(
  rows: Record<string, RowValue>[],
  columns: DatasetColumn[],
) {
  return rows.map((row) => columns.map((column) => row[column.name]));
}

function pkColumnNameToPkColumnIndex(
  primaryKeyColumnName: string,
  columns: DatasetColumn[],
) {
  return columns.findIndex((column) => column.name === primaryKeyColumnName);
}

export const {
  useInsertTableRowsMutation,
  useUpdateTableRowsMutation,
  useDeleteTableRowsMutation,
} = tableDataEditApi;
