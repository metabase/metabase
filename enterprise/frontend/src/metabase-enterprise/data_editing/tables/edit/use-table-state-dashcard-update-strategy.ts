import { useCallback, useMemo } from "react";

import { updateCardData } from "metabase/dashboard/actions/data-fetching";
import { getDashcardData } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { RowValue } from "metabase-types/api";

import {
  type TableEditingStateUpdateStrategy,
  mapDataEditingRowObjectsToRowValues,
} from "./use-table-state-update-strategy";

export function useTableEditingStateDashcardUpdateStrategy(
  dashcardId: number,
  cardId: number,
): TableEditingStateUpdateStrategy {
  const dispatch = useDispatch();

  const cardData = useSelector(
    (state) => getDashcardData(state, dashcardId)[cardId],
  );

  const onRowsCreated = useCallback(
    (rows?: Record<string, RowValue>[]) => {
      if (!cardData || !rows) {
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
    (rows?: Record<string, RowValue>[]) => {
      if (!cardData || !rows) {
        return;
      }

      const { data } = cardData;
      const pkColumnIndex = data.cols.findIndex(isPK);
      const updatedRows = mapDataEditingRowObjectsToRowValues(rows, data.cols);
      const nextRows = structuredClone(data.rows);

      for (const row of nextRows) {
        for (const updatedRow of updatedRows) {
          if (row[pkColumnIndex] === updatedRow[pkColumnIndex]) {
            // Update row values array with updated values
            for (let i = 0; i < data.cols.length; i++) {
              row[i] = updatedRow[i];
            }
          }
        }
      }

      dispatch(
        updateCardData(cardId, dashcardId, {
          ...cardData,
          data: {
            ...data,
            rows: nextRows,
          },
        }),
      );
    },
    [cardData, dashcardId, cardId, dispatch],
  );

  const onRowsDeleted = useCallback(
    (rows?: Record<string, RowValue>[]) => {
      if (!cardData || !rows) {
        return;
      }

      const { data } = cardData;
      const pkColumnIndex = data.cols.findIndex(isPK);
      const pkColumnName = data.cols[pkColumnIndex].name;
      const deletedPKs = new Set(rows.map((row) => row[pkColumnName]));
      const nextRows = structuredClone(data.rows).filter(
        (row) => !deletedPKs.has(row[pkColumnIndex]),
      );

      dispatch(
        updateCardData(cardId, dashcardId, {
          ...cardData,
          data: {
            ...data,
            rows: nextRows,
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
