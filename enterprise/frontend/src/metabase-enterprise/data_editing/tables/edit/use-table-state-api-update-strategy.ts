import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { useCallback, useMemo } from "react";

import { datasetApi } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetQuery, RowValue } from "metabase-types/api";

import type { TableEditingStateUpdateStrategy } from "./use-table-state-update-strategy";
import {
  createPrimaryKeyToUpdatedRowObjectMap,
  mapDataEditingRowObjectsToRowValues,
} from "./use-table-state-update-strategy";

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
            const pkColumnName = data.cols[pkColumnIndex].name;
            const primaryKeyToUpdatedRowObjectMap =
              createPrimaryKeyToUpdatedRowObjectMap(pkColumnName, rows);

            for (const rowArray of data.rows) {
              const updatedRowObject = primaryKeyToUpdatedRowObjectMap.get(
                rowArray[pkColumnIndex],
              );

              if (updatedRowObject) {
                for (let i = 0; i < data.cols.length; i++) {
                  const columnName = data.cols[i].name;
                  if (columnName in updatedRowObject) {
                    rowArray[i] = updatedRowObject[columnName];
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
