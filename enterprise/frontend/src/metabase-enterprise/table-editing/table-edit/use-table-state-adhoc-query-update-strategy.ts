import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { useCallback, useMemo } from "react";

import { datasetApi } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import type { DatasetQuery } from "metabase-types/api";

import type { RowCellsWithPkValue } from "../api/types";
import {
  getPkColumns,
  getRowObjectPkUniqueKeyByColumnNames,
  getRowUniqueKeyByPkIndexes,
} from "../common/utils";

import type { TableEditingStateUpdateStrategy } from "./use-table-state-update-strategy";
import {
  createPrimaryKeyToUpdatedRowObjectMap,
  mapDataEditingRowObjectsToRowValues,
} from "./use-table-state-update-strategy";

export function useTableEditingStateAdHocQueryUpdateStrategy(
  nullableAdhocQuery: DatasetQuery | undefined,
): TableEditingStateUpdateStrategy {
  // "metabase-api" state is not typed, so we need to use the `any` type
  const dispatch = useDispatch() as ThunkDispatch<any, any, UnknownAction>;

  const onRowsCreated = useCallback(
    (rows: RowCellsWithPkValue[]) => {
      const adhocQuery = checkNotNull(nullableAdhocQuery);

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
    [dispatch, nullableAdhocQuery],
  );

  const onRowsUpdated = useCallback(
    (rows: RowCellsWithPkValue[]) => {
      const adhocQuery = checkNotNull(nullableAdhocQuery);

      const patchResult = dispatch(
        datasetApi.util.updateQueryData(
          "getAdhocQuery",
          adhocQuery,
          ({ data }) => {
            const { indexes: pkIndexes, names: pkNames } = getPkColumns(
              data.cols,
            );

            const primaryKeyToUpdatedRowObjectMap =
              createPrimaryKeyToUpdatedRowObjectMap(pkNames, rows);

            for (const rowArray of data.rows) {
              const pkUniqueKey = getRowUniqueKeyByPkIndexes(
                pkIndexes,
                rowArray,
              );
              const updatedRowObject =
                primaryKeyToUpdatedRowObjectMap.get(pkUniqueKey);

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

      return {
        revert: patchResult.undo,
      };
    },
    [dispatch, nullableAdhocQuery],
  );

  const onRowsDeleted = useCallback(
    (rows: RowCellsWithPkValue[]) => {
      const adhocQuery = checkNotNull(nullableAdhocQuery);

      dispatch(
        datasetApi.util.updateQueryData(
          "getAdhocQuery",
          adhocQuery,
          ({ data }) => {
            const { indexes: pkIndexes, names: pkNames } = getPkColumns(
              data.cols,
            );

            const deletedPKsSet = new Set(
              rows.map((row) =>
                getRowObjectPkUniqueKeyByColumnNames(pkNames, row),
              ),
            );

            data.rows = data.rows.filter(
              (row) =>
                !deletedPKsSet.has(getRowUniqueKeyByPkIndexes(pkIndexes, row)),
            );
          },
        ),
      );
    },
    [dispatch, nullableAdhocQuery],
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
