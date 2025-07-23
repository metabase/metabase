import type { Location } from "history";
import { useMemo } from "react";
import { t } from "ttag";

import { useGetDatabaseQuery } from "metabase/api";
import { GenericError } from "metabase/common/components/ErrorPages";
import { Box, Flex, Stack, Text } from "metabase/ui";
import { extractRemappedColumns } from "metabase/visualizations";

import type { TableEditingActionScope } from "../api/types";
import { TableHeader } from "../common/TableHeader";
import { getRowCountMessage } from "../common/getRowCountMessage";
import { useCloseNavbarOnMount } from "../common/use-close-navbar-on-mount";
import { isDatabaseTableEditingEnabled } from "../settings";

import S from "./EditTableDataContainer.module.css";
import { EditTableDataHeader } from "./EditTableDataHeader";
import { EditTableDataOverlay } from "./EditTableDataOverlay";
import { EditTableDataGrid } from "./data-grid/EditTableDataGrid";
import { CreateRowActionFormModal } from "./modals/CreateRowActionFormModal";
import { UpdateRowActionFormModal } from "./modals/UpdateRowActionFormModal";
import { useEditTableData } from "./use-edit-table-data";
import { useEditTableLoadingOverlay } from "./use-edit-table-loading-overlay";
import { useTableCreateRow } from "./use-table-create-row";
import { useTableCRUD } from "./use-table-crud";
import { useTableExpandedUpdateRow } from "./use-table-expanded-update-row";
import { useTableEditingStateAdHocQueryUpdateStrategy } from "./use-table-state-adhoc-query-update-strategy";
import { useTableEditingUndoRedo } from "./use-table-undo-redo";

type EditTableDataContainerProps = {
  params: {
    dbId: string;
    tableId: string;
    objectId?: string;
  };
  location: Location<{ filter?: string }>;
};

export const EditTableDataContainer = ({
  params: { dbId: dbIdParam, tableId: tableIdParam },
  location,
}: EditTableDataContainerProps) => {
  useCloseNavbarOnMount();

  const databaseId = parseInt(dbIdParam, 10);
  const tableId = parseInt(tableIdParam, 10);

  const { data: database } = useGetDatabaseQuery({ id: databaseId });
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

  const { undo, redo, isUndoLoading, isRedoLoading } = useTableEditingUndoRedo({
    tableId,
    scope,
    stateUpdateStrategy,
  });

  const {
    isInserting,
    isUpdating,
    isDeleting,
    handleRowCreate,
    handleRowUpdate,
    handleRowDelete,
  } = useTableCRUD({
    scope,
    datasetData,
    stateUpdateStrategy,
  });

  const loadingOverlayProps = useEditTableLoadingOverlay({
    isDatasetLoading: isLoading,
    isDatasetFetching: isFetching,
    isUndoLoading,
    isRedoLoading,
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

  if (database && !isDatabaseTableEditingEnabled(database)) {
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
        <GenericError
          title={t`Table editing is not enabled for this database`}
          message={t`Please ask your admin to enable table editing`}
          details={undefined}
        />
      </Stack>
    );
  }

  return (
    <Stack gap={0} data-testid="edit-table-data-root" className={S.container}>
      <EditTableDataHeader
        databaseId={databaseId}
        tableId={tableId}
        question={tableQuestion}
        onQuestionChange={handleTableQuestionChange}
        isUndoLoading={isUndoLoading}
        isRedoLoading={isRedoLoading}
        onUndo={undo}
        onRedo={redo}
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
    </Stack>
  );
};
