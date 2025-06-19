import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useGetTableQueryMetadataQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import {
  useDeleteTableRowsMutation,
  useInsertTableRowsMutation,
  useUpdateTableRowsMutation,
} from "metabase-enterprise/api";
import type {
  ActionScope,
  ConcreteTableId,
  DatasetData,
  FieldWithMetadata,
} from "metabase-types/api";

import type {
  RowCellsWithPkValue,
  UpdateCellValueHandlerParams,
  UpdatedRowBulkHandlerParams,
  UpdatedRowHandlerParams,
} from "../types";

import { useTableCrudOptimisticUpdate } from "./use-table-crud-optimistic-update";
import type { TableEditingStateUpdateStrategy } from "./use-table-state-update-strategy";
import {
  getPkColumns,
  getRowPkValues,
  getRowUniqueKeyByPkIndexes,
} from "./utils";

export const useTableCRUD = ({
  tableId,
  scope,
  datasetData,
  stateUpdateStrategy,
  setRowSelection,
}: {
  tableId: ConcreteTableId;
  scope?: ActionScope;
  datasetData: DatasetData | null | undefined;
  stateUpdateStrategy: TableEditingStateUpdateStrategy;
  setRowSelection?: (state: RowSelectionState) => void;
}) => {
  const dispatch = useDispatch();
  const [crudError, setCrudError] = useState<any | null>(null);
  const {
    cellsWithFailedUpdatesMap,
    handleCellValueUpdateError,
    handleGenericUpdateError,
    handleCellValueUpdateSuccess,
  } = useTableCrudOptimisticUpdate();

  const [deleteTableRows, { isLoading: isDeleting }] =
    useDeleteTableRowsMutation();
  const [updateTableRows, { isLoading: isUpdating }] =
    useUpdateTableRowsMutation();
  const [insertTableRows, { isLoading: isInserting }] =
    useInsertTableRowsMutation();

  const { data: tableMetadata } = useGetTableQueryMetadataQuery({
    id: tableId,
  });

  const tableFieldMetadataMap = useMemo(() => {
    return (
      tableMetadata?.fields?.reduce(
        (acc, item) => ({
          ...acc,
          [item.name]: item,
        }),
        {} as Record<FieldWithMetadata["name"], FieldWithMetadata>,
      ) || {}
    );
  }, [tableMetadata]);

  const handleCellValueUpdate = useCallback(
    async ({
      updatedData,
      rowIndex,
      columnName,
    }: UpdateCellValueHandlerParams): Promise<boolean> => {
      // mostly the same as "handleRowUpdate", but has optimistic update and special error handling
      if (!datasetData) {
        console.warn(
          "Failed to update table data - no data is loaded for a table",
        );
        return false;
      }

      const rowData = datasetData.rows[rowIndex];
      const pkRecord = getRowPkValues(datasetData.cols, rowData);
      const updatedRowWithPk = {
        ...updatedData,
        ...pkRecord,
      };

      const { indexes: pkIndexes } = getPkColumns(datasetData.cols);
      const rowPkValuesKey = getRowUniqueKeyByPkIndexes(pkIndexes, rowData);

      const patchResult = stateUpdateStrategy.onRowsUpdated([updatedRowWithPk]);

      try {
        const response = await updateTableRows({
          inputs: [pkRecord],
          params: updatedData,
          scope,
        });

        if (response.error) {
          handleCellValueUpdateError(response.error, {
            columnName,
            rowPkValuesKey,
            patchResult: patchResult || undefined,
          });
        }

        if (response.data) {
          stateUpdateStrategy.onRowsUpdated(
            response.data.outputs.map((output) => output.row),
          );
          handleCellValueUpdateSuccess({
            columnName,
            rowPkValuesKey,
          });
          dispatch(
            addUndo({
              message: t`Successfully updated`,
            }),
          );
        }

        return !response.error;
      } catch (e) {
        handleCellValueUpdateError(e, {
          columnName,
          rowPkValuesKey,
          patchResult: patchResult || undefined,
        });

        return false;
      }
    },
    [
      datasetData,
      stateUpdateStrategy,
      updateTableRows,
      scope,
      handleCellValueUpdateError,
      handleCellValueUpdateSuccess,
      dispatch,
    ],
  );

  const handleRowUpdateBulk = useCallback(
    async ({ updatedData, rowIndices }: UpdatedRowBulkHandlerParams) => {
      if (!datasetData) {
        console.warn(
          "Failed to update table data - no data is loaded for a table",
        );
        return false;
      }

      const inputs = rowIndices.map((rowIndex) => {
        const rowData = datasetData.rows[rowIndex];

        return getRowPkValues(datasetData.cols, rowData);
      });

      const response = await updateTableRows({
        inputs,
        params: updatedData,
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
        handleGenericUpdateError(response.error);
      }

      return !response.error;
    },
    [
      datasetData,
      updateTableRows,
      scope,
      stateUpdateStrategy,
      dispatch,
      handleGenericUpdateError,
    ],
  );

  const handleRowUpdate = useCallback(
    async ({ updatedData, rowIndex }: UpdatedRowHandlerParams) => {
      return handleRowUpdateBulk({ updatedData, rowIndices: [rowIndex] });
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
        handleGenericUpdateError(response.error);
      }

      return !response.error;
    },
    [
      insertTableRows,
      handleGenericUpdateError,
      scope,
      stateUpdateStrategy,
      dispatch,
    ],
  );

  const handleRowDeleteBulk = useCallback(
    async (rowIndices: number[], cascadeDelete = false) => {
      if (!datasetData) {
        console.warn(
          "Failed to update table data - no data is loaded for a table",
        );
        return false;
      }

      const columns = datasetData.cols;
      const rows = rowIndices.map((rowIndex) => {
        const rowData = datasetData.rows[rowIndex];

        return getRowPkValues(columns, rowData);
      });

      const requestParams = cascadeDelete
        ? { params: { "delete-children": true } }
        : {};

      const response = await deleteTableRows({
        rows,
        scope,
        ...requestParams,
      });

      if (response.data?.outputs) {
        stateUpdateStrategy.onRowsDeleted(rows);
        setRowSelection?.({});
        setCrudError(null);
        dispatch(
          addUndo({
            message: t`${rows.length} rows successfully deleted`,
          }),
        );
      }

      if (response.error) {
        setCrudError(response.error);

        // This type of errors is handled specifically by `useForeignKeyConstraintHandling` hook.
        if (isForeignKeyConstraintErrorResponse(response.error)) {
          return false;
        }

        handleGenericUpdateError(response.error);
      }

      return !response.error;
    },
    [
      datasetData,
      deleteTableRows,
      scope,
      stateUpdateStrategy,
      setRowSelection,
      dispatch,
      handleGenericUpdateError,
    ],
  );

  const handleRowDelete = useCallback(
    async (rowIndex: number, cascadeDelete = false) => {
      return handleRowDeleteBulk([rowIndex], cascadeDelete);
    },
    [handleRowDeleteBulk],
  );

  const handleRowDeleteWithCascade = useCallback(
    async (rowIndices: number[]) => {
      return handleRowDeleteBulk(rowIndices, true);
    },
    [handleRowDeleteBulk],
  );

  return {
    isInserting,
    isDeleting,
    isUpdating,
    tableFieldMetadataMap,
    cellsWithFailedUpdatesMap,
    error: crudError,

    handleCellValueUpdate,
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
