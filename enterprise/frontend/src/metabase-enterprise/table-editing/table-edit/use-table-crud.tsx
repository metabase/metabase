import { useCallback } from "react";
import { t } from "ttag";

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

import { useTableEditingToastController } from "./toasts/use-table-editing-toast-controller";
import type { TableEditingStateUpdateStrategy } from "./use-table-state-update-strategy";

type UseTableCRUDProps = {
  scope: TableEditingActionScope;
  datasetData: DatasetData | null | undefined;
  stateUpdateStrategy: TableEditingStateUpdateStrategy;
};

export type TableRowUpdateHandler = (props: {
  input: RowCellsWithPkValue;
  params: RowCellsWithPkValue;
  shouldPerformOptimisticUpdate?: boolean;
}) => Promise<boolean>;

export type TableRowDeleteHandler = (
  input: RowCellsWithPkValue,
  cascadeDelete?: boolean,
) => Promise<boolean>;

export const useTableCRUD = ({
  scope,
  datasetData,
  stateUpdateStrategy,
}: UseTableCRUDProps) => {
  const toastController = useTableEditingToastController();

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
      shouldPerformOptimisticUpdate,
    }: {
      inputs: RowCellsWithPkValue[];
      params: RowCellsWithPkValue;
      shouldPerformOptimisticUpdate?: boolean;
    }) => {
      if (!datasetData) {
        console.warn(
          "Failed to update table data - no data is loaded for a table",
        );
        return false;
      }

      if (shouldPerformOptimisticUpdate) {
        const updatedRows = inputs.map((input) => ({
          ...input,
          ...params,
        }));

        stateUpdateStrategy.onRowsUpdated(updatedRows);
      }

      try {
        const response = await updateTableRows({
          inputs,
          params,
          scope,
        });

        if (!response.error && response.data) {
          stateUpdateStrategy.onRowsUpdated(
            response.data.outputs.map((output) => output.row),
          );

          toastController.showSuccessToast(t`Successfully updated`);
        } else {
          toastController.showErrorToast(response.error);
        }

        return !response.error;
      } catch (error) {
        toastController.showErrorToast(error);

        throw error;
      }
    },
    [datasetData, updateTableRows, scope, stateUpdateStrategy, toastController],
  );

  const handleRowUpdate = useCallback<TableRowUpdateHandler>(
    async ({ input, params, shouldPerformOptimisticUpdate }) => {
      return handleRowUpdateBulk({
        inputs: [input],
        params,
        shouldPerformOptimisticUpdate,
      });
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

        toastController.showSuccessToast(t`Record successfully created`);
      } else {
        toastController.showErrorToast(response.error);
      }

      return !response.error;
    },
    [insertTableRows, scope, stateUpdateStrategy, toastController],
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

        toastController.showSuccessToast(t`Successfully deleted`);
      }

      if (response.error) {
        toastController.showErrorToast(response.error);
      }

      return !response.error;
    },
    [datasetData, deleteTableRows, scope, stateUpdateStrategy, toastController],
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
