import { useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  useDeleteTableRowsMutation,
  useGetTableQueryMetadataQuery,
  useInsertTableRowsMutation,
  useUpdateTableRowsMutation,
} from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  ConcreteTableId,
  DatasetData,
  FieldWithMetadata,
  RowCellsWithPkValue,
  RowPkValue,
  RowValue,
  TableEditingScope,
  UpdateCellValueHandlerParams,
  UpdatedRowBulkHandlerParams,
  UpdatedRowHandlerParams,
} from "metabase-types/api";

import { useTableCrudOptimisticUpdate } from "./use-table-crud-optimistic-update";
import type { TableEditingStateUpdateStrategy } from "./use-table-state-update-strategy";
import { getRowPkKeyValue } from "./utils";

export const useTableCRUD = ({
  tableId,
  scope,
  datasetData,
  stateUpdateStrategy,
}: {
  tableId: ConcreteTableId;
  scope?: TableEditingScope;
  datasetData: DatasetData | null | undefined;
  stateUpdateStrategy: TableEditingStateUpdateStrategy;
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
    async (rowIndices: number[]) => {
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

      const response = await deleteTableRows({
        rows,
        scope,
      });

      if (response.data?.outputs) {
        stateUpdateStrategy.onRowsDeleted(rows);
        dispatch(
          addUndo({
            message: t`${rows.length} rows successfully deleted`,
          }),
        );
      }

      if (response.error) {
        handleGenericUpdateError(response.error);
      }

      return !response.error;
    },
    [
      datasetData,
      deleteTableRows,
      scope,
      stateUpdateStrategy,
      dispatch,
      handleGenericUpdateError,
    ],
  );

  const handleRowDelete = useCallback(
    async (rowIndex: number) => {
      return handleRowDeleteBulk([rowIndex]);
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
  };
};
