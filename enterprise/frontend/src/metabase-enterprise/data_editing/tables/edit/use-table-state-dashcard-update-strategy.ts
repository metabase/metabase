import { useCallback, useMemo } from "react";

import { updateCardData } from "metabase/dashboard/actions/data-fetching";
import { getDashcardData } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { RowValue } from "metabase-types/api";

import type { RowCellsWithPkValue } from "../types";

import {
  type TableEditingStateUpdateStrategy,
  createPrimaryKeyToUpdatedRowObjectMap,
  mapDataEditingRowObjectsToRowValues,
} from "./use-table-state-update-strategy";
import {
  getPkColumns,
  getRowObjectPkUniqueKeyByColumnNames,
  getRowUniqueKeyByPkIndexes,
} from "./utils";

export function useTableEditingStateDashcardUpdateStrategy(
  dashcardId: number,
  cardId: number,
): TableEditingStateUpdateStrategy {
  const dispatch = useDispatch();

  const cardData = useSelector(
    (state) => getDashcardData(state, dashcardId)[cardId],
  );

  const onRowsCreated = useCallback(
    (rows: RowCellsWithPkValue[]) => {
      if (!cardData) {
        return;
      }

      dispatch(
        updateCardData(cardId, dashcardId, {
          ...cardData,
          data: {
            ...cardData.data,
            rows: [
              ...cardData.data.rows,
              ...mapDataEditingRowObjectsToRowValues(rows, cardData.data.cols),
            ],
          },
        }),
      );
    },
    [cardData, dashcardId, cardId, dispatch],
  );

  const onRowsUpdated = useCallback(
    (rows: RowCellsWithPkValue[]) => {
      if (!cardData) {
        return;
      }

      const { indexes: pkIndexes, names: pkNames } = getPkColumns(
        cardData.data.cols,
      );

      const primaryKeyToUpdatedRowObjectMap =
        createPrimaryKeyToUpdatedRowObjectMap(pkNames, rows);

      const originalRowsPkMap: Map<RowValue, RowValue[]> = new Map();

      dispatch(
        updateCardData(cardId, dashcardId, {
          ...cardData,
          data: {
            ...cardData.data,
            rows: cardData.data.rows.map((row) => {
              const rowPkValuesKey = getRowUniqueKeyByPkIndexes(pkIndexes, row);
              const updatedRowObject =
                primaryKeyToUpdatedRowObjectMap.get(rowPkValuesKey);

              if (updatedRowObject) {
                originalRowsPkMap.set(rowPkValuesKey, row);

                const updatedRow = row.map((value, index) => {
                  const columnName = cardData.data.cols[index].name;

                  if (columnName in updatedRowObject) {
                    return updatedRowObject[columnName];
                  }

                  return value;
                });

                primaryKeyToUpdatedRowObjectMap.delete(rowPkValuesKey);

                return updatedRow;
              }

              return row;
            }),
          },
        }),
      );

      return {
        revert: () =>
          dispatch(
            updateCardData(cardId, dashcardId, {
              ...cardData,
              data: {
                ...cardData.data,
                rows: cardData.data.rows.map((row) => {
                  const rowPkValuesKey = getRowUniqueKeyByPkIndexes(
                    pkIndexes,
                    row,
                  );
                  const originalRowObject =
                    originalRowsPkMap.get(rowPkValuesKey);
                  return originalRowObject || row;
                }),
              },
            }),
          ),
      };
    },
    [cardData, dashcardId, cardId, dispatch],
  );

  const onRowsDeleted = useCallback(
    (rows: RowCellsWithPkValue[]) => {
      if (!cardData) {
        return;
      }

      const { indexes: pkIndexes, names: pkNames } = getPkColumns(
        cardData.data.cols,
      );

      const deletedPKsSet = new Set(
        rows.map((row) => getRowObjectPkUniqueKeyByColumnNames(pkNames, row)),
      );

      dispatch(
        updateCardData(cardId, dashcardId, {
          ...cardData,
          data: {
            ...cardData.data,
            rows: cardData.data.rows.filter(
              (row) =>
                !deletedPKsSet.has(getRowUniqueKeyByPkIndexes(pkIndexes, row)),
            ),
          },
        }),
      );
    },
    [cardData, dashcardId, cardId, dispatch],
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
