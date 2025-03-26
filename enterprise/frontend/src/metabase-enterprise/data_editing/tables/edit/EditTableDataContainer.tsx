import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import {
  useGetDatabaseMetadataQuery,
  useGetTableDataQuery,
  useGetTableQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { GenericError } from "metabase/components/ErrorPages";
import { useDispatch } from "metabase/lib/redux";
import { closeNavbar } from "metabase/redux/app";
import { addUndo } from "metabase/redux/undo";
import { Box, Flex, Stack, Text } from "metabase/ui";
import {
  useDeleteTableRowsMutation,
  useInsertTableRowsMutation,
  useUpdateTableRowsMutation,
} from "metabase-enterprise/api";
import { isDatabaseTableEditingEnabled } from "metabase-enterprise/data_editing/settings";
import { getRowCountMessage } from "metabase-lib/v1/queries/utils/row-count";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, RowValue } from "metabase-types/api";

import type { UpdatedRowCellsHandlerParams } from "../types";

import S from "./EditTableData.module.css";
import { EditTableDataGrid } from "./EditTableDataGrid";
import { EditTableDataHeader } from "./EditTableDataHeader";
import { EditingBaseRowModal } from "./modals/EditingBaseRowModal";

type EditTableDataContainerProps = {
  params: {
    dbId: string;
    tableId: string;
  };
};

export const EditTableDataContainer = ({
  params: { dbId: dbIdParam, tableId: tableIdParam },
}: EditTableDataContainerProps) => {
  const dbId = parseInt(dbIdParam, 10);
  const tableId = parseInt(tableIdParam, 10);

  const [
    isCreateRowModalOpen,
    { open: openCreateRowModal, close: closeCreateRowModal },
  ] = useDisclosure(false);

  const [expandedRowIndex, setExpandedRowIndex] = useState<
    number | undefined
  >();

  const dispatch = useDispatch();

  const { data: database } = useGetDatabaseMetadataQuery({ id: dbId }); // TODO: consider using just "dbId" to avoid extra data request
  const { data: table, isLoading: tableIdLoading } = useGetTableQuery({
    id: tableId,
  });
  const { data: tableMetadata } = useGetTableQueryMetadataQuery({
    id: tableId,
  });

  const tableFieldMetadataMap = useMemo(
    () =>
      tableMetadata?.fields?.reduce(
        (acc, item) => ({
          ...acc,
          [item.name]: item as Field,
        }),
        {} as Record<Field["name"], Field>,
      ),
    [tableMetadata],
  );

  const {
    data: datasetData,
    isLoading,
    refetch: refetchTableDataQuery,
  } = useGetTableDataQuery({
    tableId,
  });

  const [deleteTableRows] = useDeleteTableRowsMutation();
  const [updateTableRows] = useUpdateTableRowsMutation();
  const [insertTableRows, { isLoading: isInserting }] =
    useInsertTableRowsMutation();

  useMount(() => {
    dispatch(closeNavbar());
  });

  const displayErrorIfExsits = useCallback(
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

  const handleRowsDelete = () => {};

  const handleCellValueUpdate = useCallback(
    async ({ data, rowIndex }: UpdatedRowCellsHandlerParams) => {
      if (!datasetData) {
        console.warn(
          "Failed to update table data - no data is loaded for a table",
        );
        return;
      }

      const columns = datasetData.data.cols;
      const rowData = datasetData.data.rows[rowIndex];

      const pkColumnIndex = columns.findIndex(isPK);
      const pkColumn = columns[pkColumnIndex];
      const rowPkValue = rowData[pkColumnIndex];

      const updatedRowWithPk = {
        ...data,
        [pkColumn.name]: rowPkValue,
      };

      const response = await updateTableRows({
        tableId: tableId,
        rows: [updatedRowWithPk],
      });

      displayErrorIfExsits(response.error);

      // TODO: do an optimistic data update here using RTK cache

      refetchTableDataQuery();
    },
    [
      datasetData,
      refetchTableDataQuery,
      tableId,
      updateTableRows,
      displayErrorIfExsits,
    ],
  );

  const handleRowCreate = useCallback(
    async (data: Record<string, RowValue>) => {
      const response = await insertTableRows({
        tableId: tableId,
        rows: [data],
      });

      displayErrorIfExsits(response.error);
      if (!response.error) {
        closeCreateRowModal();
      }

      // TODO: do an optimistic data update here using RTK cache
      refetchTableDataQuery();
    },
    [
      refetchTableDataQuery,
      closeCreateRowModal,
      tableId,
      insertTableRows,
      displayErrorIfExsits,
    ],
  );

  const handleExpandedRowDetele = useCallback(
    async (rowIndex: number) => {
      if (!datasetData) {
        console.warn(
          "Failed to update table data - no data is loaded for a table",
        );
        return;
      }

      const columns = datasetData.data.cols;
      const rowData = datasetData.data.rows[rowIndex];

      const pkColumnIndex = columns.findIndex(isPK);
      const pkColumn = columns[pkColumnIndex];
      const rowPkValue = rowData[pkColumnIndex];

      closeCreateRowModal();

      const response = await deleteTableRows({
        rows: [{ [pkColumn.name]: rowPkValue }],
        tableId: tableId,
      });
      displayErrorIfExsits(response.error);
      // TODO: do an optimistic data update here using RTK cache
      refetchTableDataQuery();
    },
    [
      tableId,
      datasetData,
      closeCreateRowModal,
      deleteTableRows,
      refetchTableDataQuery,
      displayErrorIfExsits,
    ],
  );

  const handleModalOpenAndExpandedRow = useCallback(
    (rowIndex?: number) => {
      setExpandedRowIndex(rowIndex);
      openCreateRowModal();
    },
    [openCreateRowModal],
  );

  if (!database || isLoading || tableIdLoading) {
    // TODO: show loader
    return null;
  }

  if (!datasetData || !tableFieldMetadataMap) {
    // TODO: show error
    return null;
  }

  return (
    <>
      <Stack className={S.container} gap={0} data-testid="edit-table-data-root">
        {table && (
          <EditTableDataHeader
            table={table}
            onCreate={handleModalOpenAndExpandedRow}
            onDelete={handleRowsDelete}
          />
        )}
        {isDatabaseTableEditingEnabled(database) ? (
          <>
            <Box pos="relative" className={S.gridWrapper}>
              <EditTableDataGrid
                data={datasetData}
                fieldMetadataMap={tableFieldMetadataMap}
                onCellValueUpdate={handleCellValueUpdate}
                onRowExpandClick={handleModalOpenAndExpandedRow}
              />
            </Box>
            <Flex
              py="0.5rem"
              px="1.5rem"
              h="2.5rem"
              justify="flex-end"
              align="center"
              className={S.gridFooter}
            >
              <Text fw="bold" size="md" c="inherit" component="span">
                {getRowCountMessage(datasetData)}
              </Text>
            </Flex>
          </>
        ) : (
          <GenericError
            title={t`Table editing is not enabled for this database`}
            message={t`Please ask your admin to enable table editing`}
            details={undefined}
          />
        )}
      </Stack>
      <EditingBaseRowModal
        opened={isCreateRowModalOpen}
        onClose={closeCreateRowModal}
        onValueChange={handleCellValueUpdate}
        onRowCreate={handleRowCreate}
        onRowDelete={handleExpandedRowDetele}
        datasetColumns={datasetData.data.cols}
        currentRowIndex={expandedRowIndex}
        currentRowData={
          expandedRowIndex !== undefined
            ? datasetData.data.rows[expandedRowIndex]
            : undefined
        }
        isLoading={isInserting}
        fieldMetadataMap={tableFieldMetadataMap}
      />
    </>
  );
};
