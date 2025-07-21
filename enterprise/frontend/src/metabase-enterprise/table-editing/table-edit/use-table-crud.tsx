import { useCallback } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import type { DatasetData } from "metabase-types/api";

import {
  useDeleteTableRowsMutation,
  useInsertTableRowsMutation,
  useUpdateTableRowsMutation,
} from "../api";
import type {
  RowCellsWithPkValue,
  TableEditingActionScope,
} from "../api/types";

import type { TableEditingStateUpdateStrategy } from "./use-table-state-update-strategy";

type UseTableCRUDProps = {
  scope: TableEditingActionScope;
  datasetData: DatasetData | null | undefined;
  stateUpdateStrategy: TableEditingStateUpdateStrategy;
};

export type TableRowUpdateHandler = ({
  input,
  params,
}: {
  input: RowCellsWithPkValue;
  params: RowCellsWithPkValue;
}) => Promise<boolean>;

export const useTableCRUD = ({
  scope,
  datasetData,
  stateUpdateStrategy,
}: UseTableCRUDProps) => {
  const dispatch = useDispatch();

  const [deleteTableRows, { isLoading: isDeleting }] =
    useDeleteTableRowsMutation();
  const [updateTableRows, { isLoading: isUpdating }] =
    useUpdateTableRowsMutation();
  const [insertTableRows, { isLoading: isInserting }] =
    useInsertTableRowsMutation();

  const handleRowUpdateBulk = useCallback(
    async ({
      inputs,
      params,
    }: {
      inputs: RowCellsWithPkValue[];
      params: RowCellsWithPkValue;
    }) => {
      if (!datasetData) {
        console.warn(
          "Failed to update table data - no data is loaded for a table",
        );
        return false;
      }

      const response = await updateTableRows({
        inputs,
        params,
        scope,
      });

      if (!response.error && response.data) {
        stateUpdateStrategy.onRowsUpdated(
          response.data.outputs.map((output) => output.row),
        );

        dispatch(
          addUndo({
            message: t`Successfully updated`,
          }),
        );
      } else {
        // TODO: handle error
      }

      return !response.error;
    },
    [datasetData, updateTableRows, scope, stateUpdateStrategy, dispatch],
  );

  const handleRowUpdate = useCallback<TableRowUpdateHandler>(
    async ({ input, params }) => {
      return handleRowUpdateBulk({ inputs: [input], params });
    },
    [handleRowUpdateBulk],
  );

  const handleRowCreate = useCallback(
    async (data: RowCellsWithPkValue): Promise<boolean> => {
      const response = await insertTableRows({
        rows: [data],
        scope,
      });

      if (!response.error && response.data) {
        stateUpdateStrategy.onRowsCreated(
          response.data.outputs.map((output) => output.row),
        );

        dispatch(
          addUndo({
            message: t`Record successfully created`,
          }),
        );
      } else {
        // TODO: handle error
      }

      return !response.error;
    },
    [insertTableRows, scope, stateUpdateStrategy, dispatch],
  );

  const handleRowDeleteBulk = useCallback(
    async (inputs: RowCellsWithPkValue[], cascadeDelete = false) => {
      if (!datasetData) {
        console.warn(
          "Failed to update table data - no data is loaded for a table",
        );
        return false;
      }

      const requestParams = cascadeDelete
        ? { params: { "delete-children": true } }
        : {};

      const response = await deleteTableRows({
        inputs,
        scope,
        ...requestParams,
      });

      if (response.data?.outputs) {
        stateUpdateStrategy.onRowsDeleted(
          response.data.outputs.map((output) => output.row),
        );

        dispatch(
          addUndo({
            message: t`${inputs.length} rows successfully deleted`,
          }),
        );
      }

      if (response.error) {
        // This type of errors is handled specifically by `useForeignKeyConstraintHandling` hook.
        if (isForeignKeyConstraintErrorResponse(response.error)) {
          return false;
        }

        // TODO: handle error
      }

      return !response.error;
    },
    [datasetData, deleteTableRows, scope, stateUpdateStrategy, dispatch],
  );

  const handleRowDelete = useCallback(
    async (input: RowCellsWithPkValue, cascadeDelete = false) => {
      return handleRowDeleteBulk([input], cascadeDelete);
    },
    [handleRowDeleteBulk],
  );

  const handleRowDeleteWithCascade = useCallback(
    async (inputs: RowCellsWithPkValue[]) => {
      return handleRowDeleteBulk(inputs, true);
    },
    [handleRowDeleteBulk],
  );

  return {
    isInserting,
    isDeleting,
    isUpdating,

    handleRowCreate,
    handleRowUpdate,
    handleRowUpdateBulk,
    handleRowDelete,
    handleRowDeleteBulk,
    handleRowDeleteWithCascade,
  };
};

export const isForeignKeyConstraintErrorResponse = (error: any): boolean => {
  if (!error?.data?.errors) {
    return false;
  }

  return isForeignKeyConstraintError(error.data.errors);
};

export function isForeignKeyConstraintError(error: any): boolean {
  return error?.type === "metabase.actions.error/children-exist";
}
