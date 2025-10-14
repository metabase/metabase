import { useDisclosure } from "@mantine/hooks";
import type { Location } from "history";
import { useCallback, useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import { useGetDatabaseQuery, useGetTableQuery } from "metabase/api";
import {
  BulkActionBar,
  BulkActionButton,
} from "metabase/common/components/BulkActionBar";
import { GenericError } from "metabase/common/components/ErrorPages";
import { useCloseNavbarOnMount } from "metabase/common/hooks/use-close-navbar-on-mount";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Flex, Stack, Text } from "metabase/ui";
import { extractRemappedColumns } from "metabase/visualizations";

import type { TableEditingActionScope } from "../api/types";
import { TableHeader } from "../common/TableHeader";
import { getRowCountMessage } from "../common/getRowCountMessage";
import { isDatabaseTableEditingEnabled } from "../settings";

import S from "./EditTableDataContainer.module.css";
import { EditTableDataHeader } from "./EditTableDataHeader";
import { EditTableDataOverlay } from "./EditTableDataOverlay";
import { EditTableDataGrid } from "./data-grid/EditTableDataGrid";
import { CreateRowActionFormModal } from "./modals/CreateRowActionFormModal";
import { DeleteBulkRowConfirmationModal } from "./modals/DeleteBulkRowConfirmationModal";
import { UpdateRowActionFormModal } from "./modals/UpdateRowActionFormModal";
import { useEditTableData } from "./use-edit-table-data";
import { useEditTableLoadingOverlay } from "./use-edit-table-loading-overlay";
import { useTableCreateRow } from "./use-table-create-row";
import { useTableCRUD } from "./use-table-crud";
import {
  getRowInputAndParamsFromRow,
  useTableExpandedUpdateRow,
} from "./use-table-expanded-update-row";
import { useEditingTableRowSelection } from "./use-table-row-selection";
import { useTableEditingStateAdHocQueryUpdateStrategy } from "./use-table-state-adhoc-query-update-strategy";

type EditTableDataContainerProps = {
  params: {
    dbId: string;
    tableId: string;
    objectId?: string;
  };
  location: Location<{ query?: string }>;
};

export const EditTableDataContainer = ({
  params: { dbId: dbIdParam, tableId: tableIdParam },
  location,
}: EditTableDataContainerProps) => {
  useCloseNavbarOnMount();

  const databaseId = parseInt(dbIdParam, 10);
  const tableId = parseInt(tableIdParam, 10);

  const { data: database } = useGetDatabaseQuery({ id: databaseId });
  const { data: table } = useGetTableQuery({ id: tableId });

  const {
    data: rawDataset,
    isLoading,
    isFetching,
    tableQuestion,
    tableQuery,
    getColumnSortDirection,
    handleTableQuestionChange,
    handleChangeColumnSort,
  } = useEditTableData({
    tableId,
    databaseId,
    location,
  });

  const datasetData = useMemo(() => {
    return rawDataset?.data
      ? extractRemappedColumns(rawDataset.data)
      : undefined;
  }, [rawDataset]);

  const stateUpdateStrategy =
    useTableEditingStateAdHocQueryUpdateStrategy(tableQuery);

  const scope = useMemo<TableEditingActionScope>(
    () => ({ "table-id": tableId }),
    [tableId],
  );

  const {
    isInserting,
    isUpdating,
    isDeleting,
    handleRowCreate,
    handleRowUpdate,
    handleRowDelete,
    handleRowDeleteBulk,
  } = useTableCRUD({
    scope,
    datasetData,
    stateUpdateStrategy,
  });

  const loadingOverlayProps = useEditTableLoadingOverlay({
    isDatasetLoading: isLoading,
    isDatasetFetching: isFetching,
  });

  const {
    isCreateRowModalOpen,
    openCreateRowModal,
    closeCreateRowModal,
    formDescription: createFromDescription,
  } = useTableCreateRow({ scope });

  const {
    expandedRow,
    handleExpandRow,
    handleExpandedRowUpdate,
    handleExpandedRowDelete,
    closeExpandedRow,
    formDescription: updateFormDescription,
  } = useTableExpandedUpdateRow({
    scope,
    datasetData,
    handleRowUpdate,
    handleRowDelete,
  });

  const [deleteBulkRequested, deleteBulkModalController] = useDisclosure(false);
  const { rowSelection, selectedRowIndices, setRowSelection } =
    useEditingTableRowSelection();

  const handleDeleteBulkSubmit = useCallback(async () => {
    if (!datasetData) {
      return;
    }

    const { cols, rows } = datasetData;
    const inputs = selectedRowIndices.map(
      (index) => getRowInputAndParamsFromRow(cols, rows[index]).input,
    );

    const success = await handleRowDeleteBulk(inputs);
    if (success) {
      setRowSelection({});
      deleteBulkModalController.close();
    }
  }, [
    datasetData,
    setRowSelection,
    selectedRowIndices,
    handleRowDeleteBulk,
    deleteBulkModalController,
  ]);

  const isAdmin = useSelector(getUserIsAdmin);
  if (!isAdmin) {
    return (
      <EditTablePermissionError
        databaseId={databaseId}
        tableId={tableId}
        title={t`You are not allowed to edit this table`}
        message={t`Only admin users are authorized to edit tables`}
      />
    );
  }

  if (database && !isDatabaseTableEditingEnabled(database)) {
    return (
      <EditTablePermissionError
        databaseId={databaseId}
        tableId={tableId}
        title={t`Table editing is not enabled for this database`}
        message={t`Please ask your admin to enable table editing`}
      />
    );
  }

  if (table && !table.is_writable) {
    return (
      <EditTablePermissionError
        databaseId={databaseId}
        tableId={tableId}
        title={t`This table is read-only`}
        message={t`Please ask your admin to configure the connection to allow editing`}
      />
    );
  }

  return (
    <Stack gap={0} data-testid="edit-table-data-root" className={S.container}>
      <EditTableDataHeader
        databaseId={databaseId}
        tableId={tableId}
        question={tableQuestion}
        onQuestionChange={handleTableQuestionChange}
        onCreate={openCreateRowModal}
      />
      <Box pos="relative" className={S.gridWrapper}>
        <EditTableDataOverlay {...loadingOverlayProps} />
        {datasetData && (
          <EditTableDataGrid
            handleRowUpdate={handleRowUpdate}
            updateFormDescription={updateFormDescription}
            data={datasetData}
            getColumnSortDirection={getColumnSortDirection}
            onColumnSort={handleChangeColumnSort}
            onRowExpandClick={handleExpandRow}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
          />
        )}
      </Box>

      {rawDataset && (
        <Flex className={S.gridFooter}>
          <Text fw="bold" size="md" c="inherit" component="span">
            {getRowCountMessage(rawDataset)}
          </Text>
        </Flex>
      )}

      <BulkActionBar
        opened={selectedRowIndices.length > 0 && !deleteBulkRequested}
        message={ngettext(
          msgid`Selected ${selectedRowIndices.length} row`,
          `Selected ${selectedRowIndices.length} rows`,
          selectedRowIndices.length,
        )}
      >
        <BulkActionButton onClick={deleteBulkModalController.open}>
          {t`Delete`}
        </BulkActionButton>
      </BulkActionBar>

      <CreateRowActionFormModal
        opened={isCreateRowModalOpen}
        description={createFromDescription}
        onClose={closeCreateRowModal}
        onSubmit={handleRowCreate}
        isLoading={isInserting}
      />

      <UpdateRowActionFormModal
        opened={!!expandedRow}
        initialValues={expandedRow?.params}
        description={updateFormDescription}
        onClose={closeExpandedRow}
        onSubmit={handleExpandedRowUpdate}
        onDelete={handleExpandedRowDelete}
        isLoading={isUpdating}
        isDeleting={isDeleting}
      />

      <DeleteBulkRowConfirmationModal
        opened={deleteBulkRequested}
        rowCount={selectedRowIndices.length}
        onConfirm={handleDeleteBulkSubmit}
        isLoading={isDeleting}
        onClose={deleteBulkModalController.close}
      />
    </Stack>
  );
};

type EditTablePermissionErrorProps = {
  databaseId: number;
  tableId: number;
  title: string;
  message: string;
};

function EditTablePermissionError({
  databaseId,
  tableId,
  title,
  message,
}: EditTablePermissionErrorProps) {
  return (
    <Stack
      gap={0}
      data-testid="edit-table-data-restricted"
      className={S.container}
    >
      <TableHeader
        databaseId={databaseId}
        tableId={tableId}
        showEditBreadcrumb
      />
      <GenericError title={title} message={message} details={undefined} />
    </Stack>
  );
}
