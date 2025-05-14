import { useCallback, useMemo } from "react";

import { useGetTableQueryMetadataQuery } from "metabase/api";
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

import type {
  RowPkValue,
  TableEditingScope,
  UpdateCellValueHandlerParams,
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
}: {
  tableId: ConcreteTableId;
  scope?: TableEditingScope;
  datasetData: DatasetData | null | undefined;
  stateUpdateStrategy: TableEditingStateUpdateStrategy;
}) => {
  const {
    cellsWithFailedUpdatesMap,
    handleCellValueUpdateError,
    handleGenericUpdateError,
  } = useTableCrudOptimisticUpdate();

  const [deleteTableRows, { isLoading: isDeleting }] =
    useDeleteTableRowsMutation();
  const [updateTableRows] = useUpdateTableRowsMutation();
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
          tableId: tableId,
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

        if (response.data?.updated) {
          stateUpdateStrategy.onRowsUpdated(response.data.updated);
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
      handleCellValueUpdateError,
      stateUpdateStrategy,
      tableId,
      scope,
      updateTableRows,
    ],
  );

  const handleRowUpdate = useCallback(
    async ({ updatedData, rowIndex }: UpdatedRowHandlerParams) => {
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

      const response = await updateTableRows({
        tableId: tableId,
        rows: [updatedRowWithPk],
        scope,
      });

      if (!response.error && response.data) {
        stateUpdateStrategy.onRowsUpdated(response.data.updated);
      } else {
        handleGenericUpdateError(response.error);
      }

      return !response.error;
    },
    [
      datasetData,
      updateTableRows,
      tableId,
      scope,
      handleGenericUpdateError,
      stateUpdateStrategy,
    ],
  );

  const handleRowCreate = useCallback(
    async (data: Record<string, RowValue>): Promise<boolean> => {
      const response = await insertTableRows({
        tableId: tableId,
        rows: [data],
        scope,
      });

      if (!response.error && response.data) {
        stateUpdateStrategy.onRowsCreated(response.data["created-rows"]);
      } else {
        handleGenericUpdateError(response.error);
      }

      return !response.error;
    },
    [
      insertTableRows,
      tableId,
      handleGenericUpdateError,
      scope,
      stateUpdateStrategy,
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
        tableId: tableId,
        scope,
      });

      if (response.data?.success) {
        stateUpdateStrategy.onRowsDeleted(rows);
      }

      if (response.error) {
        handleGenericUpdateError(response.error);
      }

      return !response.error;
    },
    [
      datasetData,
      deleteTableRows,
      tableId,
      scope,
      stateUpdateStrategy,
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
    tableFieldMetadataMap,
    cellsWithFailedUpdatesMap,

    handleCellValueUpdate,
    handleRowCreate,
    handleRowUpdate,
    handleRowDelete,
    handleRowDeleteBulk,
  };
};
