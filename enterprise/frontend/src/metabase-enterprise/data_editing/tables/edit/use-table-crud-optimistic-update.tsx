import { useCallback, useMemo, useState } from "react";

import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";

import type { CellUniqKey, RowPkValue } from "../types";

import { ErrorUpdateToast } from "./ErrorUpdateToast";
import type { OptimisticUpdatePatchResult } from "./use-table-state-update-strategy";
import { getCellUniqKey, getUpdateApiErrorMessage } from "./utils";

export const useTableCrudOptimisticUpdate = () => {
  const [cellsWithFailedUpdatesMap, setCellsWithFailedUpdatesMap] = useState<
    Record<CellUniqKey, number>
  >({});

  const dispatch = useDispatch();

  const remappedCellsWithFailedUpdatesMap = useMemo(
    () =>
      Object.keys(cellsWithFailedUpdatesMap).reduce(
        (result, key) => {
          result[key] = true;
          return result;
        },
        {} as Record<CellUniqKey, true>,
      ),
    [cellsWithFailedUpdatesMap],
  );

  const handleCellValueUpdateError = useCallback(
    (
      error: unknown,
      cellUpdateContext: {
        rowPkValue: RowPkValue;
        columnName: string;
        patchResult: OptimisticUpdatePatchResult | undefined;
      },
    ) => {
      const { columnName, rowPkValue, patchResult } = cellUpdateContext;

      const cellUniqKey = getCellUniqKey(rowPkValue, columnName);

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
              const currentFailedUpdatesCount = prevState[cellUniqKey];
              const newCount = currentFailedUpdatesCount - 1;
              const newMap = { ...prevState };

              if (newCount === 0) {
                delete newMap[cellUniqKey];
              } else {
                newMap[cellUniqKey] = newCount;
              }

              return newMap;
            });
          },
        }),
      );

      const currentFailedUpdatesCount =
        cellsWithFailedUpdatesMap[cellUniqKey] || 0;

      setCellsWithFailedUpdatesMap({
        ...cellsWithFailedUpdatesMap,
        [cellUniqKey]: currentFailedUpdatesCount + 1,
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

  const handleCellValueUpdateSuccess = useCallback(
    ({
      rowPkValue,
      columnName,
    }: {
      rowPkValue: RowPkValue;
      columnName: string;
    }) => {
      const cellUniqKey = getCellUniqKey(rowPkValue, columnName);
      setCellsWithFailedUpdatesMap((prevState) => {
        const newMap = { ...prevState };
        delete newMap[cellUniqKey];

        return newMap;
      });
    },
    [],
  );

  return {
    cellsWithFailedUpdatesMap: remappedCellsWithFailedUpdatesMap,
    handleCellValueUpdateError,
    handleGenericUpdateError,
    handleCellValueUpdateSuccess,
  };
};
