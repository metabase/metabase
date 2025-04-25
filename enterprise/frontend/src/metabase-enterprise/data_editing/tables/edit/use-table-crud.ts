import { useDisclosure } from "@mantine/hooks";
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
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  ConcreteTableId,
  DatasetData,
  FieldWithMetadata,
  RowValue,
} from "metabase-types/api";

import type { TableEditingStateUpdateStrategy } from "./use-table-state-update-strategy";

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

  const pkColumnName = useMemo(() => {
    if (!datasetData) {
      return;
    }

    const pkColumnIndex = datasetData.cols.findIndex(isPK);

    return datasetData.cols[pkColumnIndex].name;
  }, [datasetData]);

  const handleRowUpdate = useCallback(
    async (primaryKey: RowValue, data: Record<string, RowValue>) => {
      if (!pkColumnName) {
        console.warn(
          "Failed to update table data - no primary key column is loaded for a table",
        );
        return;
      }

      const response = await updateTableRows({
        tableId: tableId,
        rows: [
          {
            ...data,
            [pkColumnName]: primaryKey,
          },
        ],
      });

      stateUpdateStrategy.onRowsUpdated(response.data?.updated);
      displayErrorIfExists(response.error);
    },
    [
      pkColumnName,
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

      displayErrorIfExists(response.error);
      if (!response.error) {
        closeCreateRowModal();
        stateUpdateStrategy.onRowsCreated(response.data?.["created-rows"]);
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
    async (primaryKey: RowValue) => {
      if (!pkColumnName) {
        console.warn(
          "Failed to update table data - no primary key column is loaded for a table",
        );
        return;
      }

      closeCreateRowModal();

      const rows = [{ [pkColumnName]: primaryKey }];
      const response = await deleteTableRows({
        rows,
        tableId: tableId,
      });

      if (response.data?.success) {
        stateUpdateStrategy.onRowsDeleted(rows);
      }

      displayErrorIfExists(response.error);
    },
    [
      pkColumnName,
      closeCreateRowModal,
      deleteTableRows,
      tableId,
      displayErrorIfExists,
      stateUpdateStrategy,
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

    handleRowCreate,
    handleRowDelete,
    handleRowUpdate,
    handleModalOpenAndExpandedRow,
  };
};
