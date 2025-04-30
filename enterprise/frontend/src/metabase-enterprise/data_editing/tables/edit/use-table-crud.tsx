import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useGetTableQueryMetadataQuery } from "metabase/api";
import type { DataGridCellId } from "metabase/data-grid";
import { getResponseErrorMessage } from "metabase/lib/errors";
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

import type {
  UpdateCellValueHandlerParams,
  UpdatedRowHandlerParams,
} from "../types";

import { ErrorUpdateToast } from "./ErrorUpdateToast";
import type {
  TableEditingStateUpdateStrategy,
  UndoObject,
} from "./use-table-state-update-strategy";
import { getRowPkKeyValue } from "./utils";

export const useTableCRUD = ({
  tableId,
  datasetData,
  stateUpdateStrategy,
}: {
  tableId: ConcreteTableId;
  datasetData: DatasetData | null | undefined;
  stateUpdateStrategy: TableEditingStateUpdateStrategy;
}) => {
  const [
    isCreateRowModalOpen,
    { open: openCreateRowModal, close: closeCreateRowModal },
  ] = useDisclosure(false);

  const [expandedRowIndex, setExpandedRowIndex] = useState<
    number | undefined
  >();

  const [cellsWithFailedUpdatesMap, setCellsWithFailedUpdatesMap] = useState<
    Record<DataGridCellId, true>
  >({}); // TODO: maybe ref or set?

  const dispatch = useDispatch();

  const [deleteTableRows] = useDeleteTableRowsMutation();
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

  const displayErrorIfExists = useCallback(
    (error: unknown) => {
      if (error) {
        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "error",
            message: getResponseErrorMessage(error) ?? t`An error occurred`,
          }),
        );
      }
    },
    [dispatch],
  );

  const handleCellValueUpdateError = useCallback(
    (
      error: unknown,
      cellUpdateContext: {
        cellId: DataGridCellId;
        patchResult: UndoObject | undefined;
      },
    ) => {
      const { cellId, patchResult } = cellUpdateContext;

      patchResult?.undo();

      dispatch(
        addUndo({
          toastColor: "bg-black",
          icon: null,
          renderChildren: () => <ErrorUpdateToast error={error} />,
          timeout: null, // removes automatic toast hide
          undo: false,
          onDismiss: () => {
            // TODO: handle case when there are 2+ failed updates for a single cell id
            setCellsWithFailedUpdatesMap((prevState) => {
              const newMap = { ...prevState };
              delete newMap[cellId];
              return newMap;
            });
          },

          // TODO: add list of open failed updates toast ids, clean them in case of filters update
        }),
      );

      setCellsWithFailedUpdatesMap({
        ...cellsWithFailedUpdatesMap,
        [cellId]: true,
      });
    },
    [cellsWithFailedUpdatesMap, dispatch],
  );

  const handleCellValueUpdate = useCallback(
    async ({ updatedData, rowIndex, cellId }: UpdateCellValueHandlerParams) => {
      // mostly the same as "handleRowUpdate", but has optimistic update and special error handling
      if (!datasetData) {
        console.warn(
          "Failed to update table data - no data is loaded for a table",
        );
        return;
      }

      const pkRecord = getRowPkKeyValue(datasetData, rowIndex);
      const updatedRowWithPk = {
        ...updatedData,
        ...pkRecord,
      };

      const patchResult = stateUpdateStrategy.onRowsUpdated([updatedRowWithPk]);

      try {
        const response = await updateTableRows({
          tableId: tableId,
          rows: [updatedRowWithPk],
        });

        if (response.error) {
          handleCellValueUpdateError(response.error, {
            cellId,
            patchResult: patchResult || undefined,
          });
        }
      } catch (e) {
        handleCellValueUpdateError(e, {
          cellId,
          patchResult: patchResult || undefined,
        });
      }
    },
    [
      datasetData,
      handleCellValueUpdateError,
      stateUpdateStrategy,
      tableId,
      updateTableRows,
    ],
  );

  const handleRowUpdate = useCallback(
    async ({ updatedData, rowIndex }: UpdatedRowHandlerParams) => {
      if (!datasetData) {
        console.warn(
          "Failed to update table data - no data is loaded for a table",
        );
        return;
      }

      const pkRecord = getRowPkKeyValue(datasetData, rowIndex);
      const updatedRowWithPk = {
        ...updatedData,
        ...pkRecord,
      };

      const response = await updateTableRows({
        tableId: tableId,
        rows: [updatedRowWithPk],
      });

      if (!response.error && response.data) {
        stateUpdateStrategy.onRowsUpdated(response.data.updated);
      } else {
        displayErrorIfExists(response.error);
      }
    },
    [
      datasetData,
      updateTableRows,
      tableId,
      displayErrorIfExists,
      stateUpdateStrategy,
    ],
  );

  const handleRowCreate = useCallback(
    async (data: Record<string, RowValue>) => {
      const response = await insertTableRows({
        tableId: tableId,
        rows: [data],
      });

      if (!response.error && response.data) {
        closeCreateRowModal();
        stateUpdateStrategy.onRowsCreated(response.data["created-rows"]);
      } else {
        displayErrorIfExists(response.error);
      }
    },
    [
      insertTableRows,
      tableId,
      displayErrorIfExists,
      closeCreateRowModal,
      stateUpdateStrategy,
    ],
  );

  const handleRowDelete = useCallback(
    async (rowIndex: number) => {
      if (!datasetData) {
        console.warn(
          "Failed to update table data - no data is loaded for a table",
        );
        return;
      }

      const columns = datasetData.cols;
      const rowData = datasetData.rows[rowIndex];

      const pkColumnIndex = columns.findIndex(isPK);
      const pkColumn = columns[pkColumnIndex];
      const rowPkValue = rowData[pkColumnIndex];

      closeCreateRowModal();

      const rows = [{ [pkColumn.name]: rowPkValue }];
      const response = await deleteTableRows({
        rows,
        tableId: tableId,
      });

      if (response.data?.success) {
        stateUpdateStrategy.onRowsDeleted(rows);
      }

      if (response.error) {
        displayErrorIfExists(response.error);
      }
    },
    [
      datasetData,
      closeCreateRowModal,
      deleteTableRows,
      tableId,
      stateUpdateStrategy,
      displayErrorIfExists,
    ],
  );

  const handleModalOpenAndExpandedRow = useCallback(
    (rowIndex?: number) => {
      setExpandedRowIndex(rowIndex);
      openCreateRowModal();
    },
    [openCreateRowModal],
  );

  return {
    isCreateRowModalOpen,
    expandedRowIndex,
    isInserting,
    closeCreateRowModal,
    tableFieldMetadataMap,
    cellsWithFailedUpdatesMap,

    handleCellValueUpdate,
    handleRowCreate,
    handleRowUpdate,
    handleRowDelete,
    handleModalOpenAndExpandedRow,
  };
};
