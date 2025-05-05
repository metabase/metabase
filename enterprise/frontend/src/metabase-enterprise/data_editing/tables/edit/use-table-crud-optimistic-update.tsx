import { useCallback, useMemo, useState } from "react";

import type { DataGridCellId } from "metabase/data-grid";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";

import { ErrorUpdateToast } from "./ErrorUpdateToast";
import type { OptimisticUpdatePatchResult } from "./use-table-state-update-strategy";
import { getUpdateApiErrorMessage } from "./utils";

export const useTableCrudOptimisticUpdate = () => {
  const [cellsWithFailedUpdatesMap, setCellsWithFailedUpdatesMap] = useState<
    Record<DataGridCellId, number>
  >({});

  const dispatch = useDispatch();

  const remappedCellsWithFailedUpdatesMap = useMemo(
    () =>
      Object.keys(cellsWithFailedUpdatesMap).reduce(
        (result, key) => {
          result[key] = true;
          return result;
        },
        {} as Record<DataGridCellId, true>,
      ),
    [cellsWithFailedUpdatesMap],
  );

  const handleCellValueUpdateError = useCallback(
    (
      error: unknown,
      cellUpdateContext: {
        cellId: DataGridCellId;
        patchResult: OptimisticUpdatePatchResult | undefined;
      },
    ) => {
      const { cellId, patchResult } = cellUpdateContext;

      patchResult?.revert();

      dispatch(
        addUndo({
          toastColor: "bg-black",
          icon: null,
          renderChildren: () => <ErrorUpdateToast error={error} />,
          timeout: null, // removes automatic toast hide
          undo: false,
          onDismiss: () => {
            setCellsWithFailedUpdatesMap((prevState) => {
              const currentFailedUpdatesCount = prevState[cellId];
              const newCount = currentFailedUpdatesCount - 1;
              const newMap = { ...prevState };

              if (newCount === 0) {
                delete newMap[cellId];
              } else {
                newMap[cellId] = newCount;
              }

              return newMap;
            });
          },
        }),
      );

      const currentFailedUpdatesCount = cellsWithFailedUpdatesMap[cellId] || 0;

      setCellsWithFailedUpdatesMap({
        ...cellsWithFailedUpdatesMap,
        [cellId]: currentFailedUpdatesCount + 1,
      });
    },
    [cellsWithFailedUpdatesMap, dispatch],
  );

  const handleGenericUpdateError = useCallback(
    (error: unknown) => {
      if (error) {
        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "error",
            message: getUpdateApiErrorMessage(error),
          }),
        );
      }
    },
    [dispatch],
  );

  return {
    cellsWithFailedUpdatesMap: remappedCellsWithFailedUpdatesMap,
    handleCellValueUpdateError,
    handleGenericUpdateError,
  };
};
