import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { useCallback, useMemo } from "react";

import { datasetApi } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetQuery, RowValue } from "metabase-types/api";

import type { TableEditingStateUpdateStrategy } from "./use-table-state-update-strategy";
import { mapDataEditingRowObjectsToRowValues } from "./use-table-state-update-strategy";

export function useTableEditingStateApiUpdateStrategy(
  adhocQuery: DatasetQuery | undefined,
): TableEditingStateUpdateStrategy {
  // "metabase-api" state is not typed, so we need to use the `any` type
  const dispatch = useDispatch() as ThunkDispatch<any, any, UnknownAction>;

  const onRowsCreated = useCallback(
    (rows?: Record<string, RowValue>[]) => {
      if (!rows || !adhocQuery) {
        return;
      }

      dispatch(
        datasetApi.util.updateQueryData(
          "getAdhocQuery",
          adhocQuery,
          ({ data }) => {
            data.rows.push(
              ...mapDataEditingRowObjectsToRowValues(rows, data.cols),
            );
          },
        ),
      );
    },
    [dispatch, adhocQuery],
  );

  const onRowsUpdated = useCallback(
    (rows?: Record<string, RowValue>[]) => {
      if (!rows || !adhocQuery) {
        return;
      }

      dispatch(
        datasetApi.util.updateQueryData(
          "getAdhocQuery",
          adhocQuery,
          ({ data }) => {
            const pkColumnIndex = data.cols.findIndex(isPK);
            const updatedRows = mapDataEditingRowObjectsToRowValues(
              rows,
              data.cols,
            );

            // TODO: consider optimization (https://github.com/metabase/metabase/pull/56427/files#r2036106565)
            for (const row of data.rows) {
              for (const updatedRow of updatedRows) {
                if (row[pkColumnIndex] === updatedRow[pkColumnIndex]) {
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
    [dispatch, adhocQuery],
  );

  const onRowsDeleted = useCallback(
    (rows?: Record<string, RowValue>[]) => {
      if (!rows || !adhocQuery) {
        return;
      }

      dispatch(
        datasetApi.util.updateQueryData(
          "getAdhocQuery",
          adhocQuery,
          ({ data }) => {
            const pkColumnIndex = data.cols.findIndex(isPK);
            const pkColumnName = data.cols[pkColumnIndex].name;
            const deletedPKs = new Set(rows.map((row) => row[pkColumnName]));

            data.rows = data.rows.filter(
              (row) => !deletedPKs.has(row[pkColumnIndex]),
            );
          },
        ),
      );
    },
    [dispatch, adhocQuery],
  );

  return useMemo(
    () => ({
      onRowsCreated,
      onRowsUpdated,
      onRowsDeleted,
    }),
    [onRowsCreated, onRowsUpdated, onRowsDeleted],
  );
}
