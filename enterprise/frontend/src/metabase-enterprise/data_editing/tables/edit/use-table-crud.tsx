import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useGetTableQueryMetadataQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import {
  useDeleteTableRowsMutation,
  useInsertTableRowsMutation,
  useUpdateTableRowsMutation,
} from "metabase-enterprise/api";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  ConcreteTableId,
  DatasetData,
  FieldWithMetadata,
  RowValue,
} from "metabase-types/api";
import type { RowSelectionState } from "@tanstack/react-table";

import type {
  RowCellsWithPkValue,
  RowPkValue,
  TableEditingScope,
  UpdateCellValueHandlerParams,
  UpdatedRowBulkHandlerParams,
  UpdatedRowHandlerParams,
} from "../types";

import { useTableCrudOptimisticUpdate } from "./use-table-crud-optimistic-update";
import type { TableEditingStateUpdateStrategy } from "./use-table-state-update-strategy";
import { getRowPkKeyValue } from "./utils";

export const useTableCRUD = ({
  tableId,
  scope,
  datasetData,
  stateUpdateStrategy,
  setRowSelection,
  onForeignKeyError,
}: {
  tableId: ConcreteTableId;
  scope?: TableEditingScope;
  datasetData: DatasetData | null | undefined;
  stateUpdateStrategy: TableEditingStateUpdateStrategy;
  setRowSelection?: (state: RowSelectionState) => void;
  onForeignKeyError?: (error: any, rowIndices: number[]) => boolean;
}) => {
  const dispatch = useDispatch();
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

      const pkRecord = getRowPkKeyValue(datasetData, rowIndex);
      const updatedRowWithPk = {
        ...updatedData,
        ...pkRecord,
      };

      const rowPkValue = Object.values(pkRecord)[0] as RowPkValue;

      const patchResult = stateUpdateStrategy.onRowsUpdated([updatedRowWithPk]);

      try {
        const response = await updateTableRows({
          rows: [updatedRowWithPk],
          scope,
        });

        if (response.error) {
          handleCellValueUpdateError(response.error, {
            columnName,
            rowPkValue,
            patchResult: patchResult || undefined,
          });
        }

        if (response.data) {
          stateUpdateStrategy.onRowsUpdated(
            response.data.outputs.map((output) => output.row),
          );
          handleCellValueUpdateSuccess({
            columnName,
            rowPkValue,
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
          rowPkValue,
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

      const updatedRows: RowCellsWithPkValue[] = [];

      for (const rowIndex of rowIndices) {
        const pkRecord = getRowPkKeyValue(datasetData, rowIndex);

        updatedRows.push({
          ...updatedData,
          ...pkRecord,
        });
      }

      const response = await updateTableRows({
        rows: updatedRows,
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
    async (data: Record<string, RowValue>): Promise<boolean> => {
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

        const pkColumnIndex = columns.findIndex(isPK);
        const pkColumn = columns[pkColumnIndex];
        const rowPkValue = rowData[pkColumnIndex];

        return { [pkColumn.name]: rowPkValue };
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
        dispatch(
          addUndo({
            message: t`${rows.length} rows successfully deleted`,
          }),
        );
      }

      if (response.error) {
        // Check if it's a foreign key constraint error and if we have a handler
        if (onForeignKeyError && !cascadeDelete && onForeignKeyError(response.error, rowIndices)) {
          // The error was handled by the foreign key handler
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
      onForeignKeyError,
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

    handleCellValueUpdate,
    handleRowCreate,
    handleRowUpdate,
    handleRowUpdateBulk,
    handleRowDelete,
    handleRowDeleteBulk,
    handleRowDeleteWithCascade,
  };
};
