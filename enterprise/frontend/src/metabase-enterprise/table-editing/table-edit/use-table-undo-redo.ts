import { useCallback } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import type { TableId } from "metabase-types/api";

import { useTableRedoMutation, useTableUndoMutation } from "../api";
import type {
  RowCellsWithPkValue,
  TableEditingActionScope,
} from "../api/types";

import type { TableEditingStateUpdateStrategy } from "./use-table-state-update-strategy";

type UseTableEditingUndoRedoProps = {
  tableId: TableId;
  scope?: TableEditingActionScope;
  stateUpdateStrategy: TableEditingStateUpdateStrategy;
};

export function useTableEditingUndoRedo({
  tableId,
  scope,
  stateUpdateStrategy,
}: UseTableEditingUndoRedoProps) {
  const dispatch = useDispatch();

  const [undoMutation, { isLoading: isUndoLoading }] = useTableUndoMutation();
  const [redoMutation, { isLoading: isRedoLoading }] = useTableRedoMutation();

  const handleResponse = useCallback(
    (
      operationName: "undo" | "redo",
      response:
        | Awaited<ReturnType<typeof undoMutation>>
        | Awaited<ReturnType<typeof redoMutation>>,
    ) => {
      if (response.error) {
        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "error",
            message: getErrorMessage(response.error),
          }),
        );
      } else if (!response.data) {
        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "warning",
            message:
              operationName === "undo"
                ? t`Nothing to undo`
                : t`Nothing to redo`,
          }),
        );
      } else if (response.data?.outputs) {
        const operations = response.data?.outputs.reduce(
          (acc, output) => {
            if (output.op === "created") {
              acc.created.push(output.row);
            } else if (output.op === "updated") {
              acc.updated.push(output.row);
            } else if (output.op === "deleted") {
              acc.deleted.push(output.row);
            }

            return acc;
          },
          {
            created: [] as RowCellsWithPkValue[],
            updated: [] as RowCellsWithPkValue[],
            deleted: [] as RowCellsWithPkValue[],
          },
        );

        if (operations.created.length > 0) {
          stateUpdateStrategy.onRowsCreated(operations.created);
        }
        if (operations.updated.length > 0) {
          stateUpdateStrategy.onRowsUpdated(operations.updated);
        }
        if (operations.deleted.length > 0) {
          stateUpdateStrategy.onRowsDeleted(operations.deleted);
        }
      }
    },
    [dispatch, stateUpdateStrategy],
  );

  const undo = useCallback(async () => {
    const response = await undoMutation({ tableId, scope });
    handleResponse("undo", response);
  }, [undoMutation, tableId, scope, handleResponse]);

  const redo = useCallback(async () => {
    const response = await redoMutation({ tableId, scope });
    handleResponse("redo", response);
  }, [redoMutation, tableId, scope, handleResponse]);

  return { undo, redo, isUndoLoading, isRedoLoading };
}
