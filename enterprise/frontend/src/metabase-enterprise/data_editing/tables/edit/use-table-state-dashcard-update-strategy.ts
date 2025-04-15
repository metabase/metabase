import { useCallback, useMemo } from "react";

import { updateCardData } from "metabase/dashboard/actions/data-fetching";
import { getDashcardData } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { RowValue } from "metabase-types/api";

import {
  MISSING_COLUMN_MARK,
  type TableEditingStateUpdateStrategy,
  mapDataEditingRowObjectsToPartialRowValues,
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

      const pkColumnIndex = cardData.data.cols.findIndex(isPK);
      const updatedRows = mapDataEditingRowObjectsToPartialRowValues(
        rows,
        cardData.data.cols,
      );

      dispatch(
        updateCardData(cardId, dashcardId, {
          ...cardData,
          data: {
            ...cardData.data,
            rows: cardData.data.rows.map((row) => {
              for (const updatedRow of updatedRows) {
                if (row[pkColumnIndex] === updatedRow[pkColumnIndex]) {
                  // For partial updates (e.g. undo/redo), the updated value may be missing
                  // so we keep the original value
                  return updatedRow.map((value, index) =>
                    value === MISSING_COLUMN_MARK ? row[index] : value,
                  );
                }
              }

              return row;
            }),
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

      const pkColumnIndex = cardData.data.cols.findIndex(isPK);
      const pkColumnName = cardData.data.cols[pkColumnIndex].name;
      const deletedPKs = new Set(rows.map((row) => row[pkColumnName]));

      dispatch(
        updateCardData(cardId, dashcardId, {
          ...cardData,
          data: {
            ...cardData.data,
            rows: cardData.data.rows.filter(
              (row) => !deletedPKs.has(row[pkColumnIndex]),
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
