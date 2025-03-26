import { useDisclosure } from "@mantine/hooks";
import { useCallback, useState } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import {
  useDeleteTableRowsMutation,
  useInsertTableRowsMutation,
  useUpdateTableRowsMutation,
} from "metabase-enterprise/api";
import type { UpdatedRowCellsHandlerParams } from "metabase-enterprise/data_editing/tables/types";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  ConcreteTableId,
  DatasetData,
  RowValue,
} from "metabase-types/api";

export const useTableCRUD = ({
  tableId,
  datasetData,
  refetchTableDataQuery,
}: {
  tableId: ConcreteTableId;
  datasetData: DatasetData | null | undefined;
  refetchTableDataQuery?: () => void;
}) => {
  const [
    isCreateRowModalOpen,
    { open: openCreateRowModal, close: closeCreateRowModal },
  ] = useDisclosure(false);

  const [expandedRowIndex, setExpandedRowIndex] = useState<
    number | undefined
  >();

  const dispatch = useDispatch();

  const [deleteTableRows] = useDeleteTableRowsMutation();
  const [updateTableRows] = useUpdateTableRowsMutation();
  const [insertTableRows, { isLoading: isInserting }] =
    useInsertTableRowsMutation();

  const displayErrorIfExists = useCallback(
    (error: any) => {
      if (error) {
        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "error",
            message: error?.data?.errors?.[0].error ?? t`An error occurred`,
          }),
        );
      }
    },
    [dispatch],
  );

  const handleCellValueUpdate = useCallback(
    async ({ updatedData, rowIndex }: UpdatedRowCellsHandlerParams) => {
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

      const updatedRowWithPk = {
        ...updatedData,
        [pkColumn.name]: rowPkValue,
      };

      const response = await updateTableRows({
        tableId: tableId,
        rows: [updatedRowWithPk],
        primaryKeyColumnName: pkColumn.name,
      });

      displayErrorIfExists(response.error);

      refetchTableDataQuery?.();
    },
    [
      datasetData,
      updateTableRows,
      tableId,
      displayErrorIfExists,
      refetchTableDataQuery,
    ],
  );

  const handleRowCreate = useCallback(
    async (data: Record<string, RowValue>) => {
      const response = await insertTableRows({
        tableId: tableId,
        rows: [data],
      });

      displayErrorIfExists(response.error);
      if (!response.error) {
        closeCreateRowModal();
      } else {
        refetchTableDataQuery?.();
      }
    },
    [
      insertTableRows,
      tableId,
      displayErrorIfExists,
      closeCreateRowModal,
      refetchTableDataQuery,
    ],
  );

  const handleExpandedRowDelete = useCallback(
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

      const response = await deleteTableRows({
        rows: [{ [pkColumn.name]: rowPkValue }],
        tableId: tableId,
        primaryKeyColumnName: pkColumn.name,
      });
      displayErrorIfExists(response.error);

      refetchTableDataQuery?.();
    },
    [
      datasetData,
      closeCreateRowModal,
      deleteTableRows,
      tableId,
      displayErrorIfExists,
      refetchTableDataQuery,
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

    handleRowCreate,
    handleCellValueUpdate,
    handleExpandedRowDelete,
    handleModalOpenAndExpandedRow,
  };
};
