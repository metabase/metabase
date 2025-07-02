import { useDisclosure } from "@mantine/hooks";
import type { Location } from "history";
import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { useMount } from "react-use";
import { t } from "ttag";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetDatabaseQuery,
} from "metabase/api";
import { GenericError } from "metabase/common/components/ErrorPages";
import { useDispatch } from "metabase/lib/redux";
import { closeNavbar } from "metabase/redux/app";
import { Box, Flex, Stack, Text } from "metabase/ui";
import { extractRemappedColumns } from "metabase/visualizations";
import { isDatabaseTableEditingEnabled } from "metabase-enterprise/data_editing/settings";
import { getRowCountMessage } from "metabase-lib/v1/queries/utils/row-count";

import { BuiltInTableAction } from "../types";

import S from "./EditTableData.module.css";
import { EditTableDataGrid } from "./EditTableDataGrid";
import { EditTableDataHeader } from "./EditTableDataHeader";
import { EditTableDataOverlay } from "./EditTableDataOverlay";
import { ActionBulkUpdateRowFormModal } from "./modals/ActionBulkUpdateRowFormModal";
import { ActionCreateRowFormModal } from "./modals/ActionCreateRowFormModal";
import { ActionUpdateRowFormModal } from "./modals/ActionUpdateRowFormModal";
import { DeleteBulkRowConfirmationModal } from "./modals/DeleteBulkRowConfirmationModal";
import { ForeignKeyConstraintModal } from "./modals/ForeignKeyConstraintModal";
import { UnsavedLeaveConfirmationModal } from "./modals/UnsavedLeaveConfirmationModal";
import { useActionUpdateRowModalFromDatasetWithObjectId } from "./modals/use-action-update-row-modal-with-object-id";
import { useForeignKeyConstraintHandling } from "./modals/use-foreign-key-constraint-handling";
import { useTableBulkDeleteConfirmation } from "./modals/use-table-bulk-delete-confirmation";
import { getTableEditPathname } from "./url";
import { useStandaloneTableQuery } from "./use-standalone-table-query";
import { useActionFormDescription } from "./use-table-action-form-description";
import { useTableCRUD } from "./use-table-crud";
import { useEditingTableRowSelection } from "./use-table-row-selection";
import { useTableSorting } from "./use-table-sorting";
import { useTableEditingStateApiUpdateStrategy } from "./use-table-state-api-update-strategy";
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
  params: { dbId: dbIdParam, tableId: tableIdParam, objectId: objectIdParam },
  location,
}: EditTableDataContainerProps) => {
  const databaseId = parseInt(dbIdParam, 10);
  const tableId = parseInt(tableIdParam, 10);

  const dispatch = useDispatch();

  const { data: database } = useGetDatabaseQuery({ id: databaseId });

  const { fakeTableQuestion, fakeTableQuery, table, handleQuestionChange } =
    useStandaloneTableQuery({ tableId, databaseId, location });

  const {
    data: rawDatasetResult,
    isFetching,
    isLoading,
    refetch,
  } = useGetAdhocQueryQuery(fakeTableQuery || skipToken, {
    // Invalidates cache when filter changes (some records might be updated)
    refetchOnMountOrArgChange: true,
  });

  const datasetData = useMemo(() => {
    return rawDatasetResult
      ? extractRemappedColumns(rawDatasetResult.data)
      : undefined;
  }, [rawDatasetResult]);

  const handleCurrentObjectIdChange = useCallback(
    (objectId?: string) => {
      dispatch(
        push({
          ...location,
          pathname: getTableEditPathname(databaseId, tableId, objectId),
        }),
      );
    },
    [databaseId, tableId, location, dispatch],
  );

  const stateUpdateStrategy =
    useTableEditingStateApiUpdateStrategy(fakeTableQuery);

  const editingScope = useMemo(() => {
    return { "table-id": tableId };
  }, [tableId]);

  const { rowSelection, selectedRowIndices, setRowSelection } =
    useEditingTableRowSelection();

  const {
    isInserting,
    isDeleting,
    isUpdating,
    tableFieldMetadataMap,
    cellsWithFailedUpdatesMap,
    error,

    handleCellValueUpdate,
    handleRowCreate,
    handleRowUpdate,
    handleRowUpdateBulk,
    handleRowDelete,
    handleRowDeleteBulk,
    handleRowDeleteWithCascade,
  } = useTableCRUD({
    tableId,
    scope: editingScope,
    datasetData,
    stateUpdateStrategy,
    setRowSelection,
  });

  const {
    isForeignKeyModalOpen,
    foreignKeyError,
    handleForeignKeyConfirmation,
    handleForeignKeyCancel,
  } = useForeignKeyConstraintHandling({
    onCascadeDelete: handleRowDeleteWithCascade,
    selectedRowIndices,
    setRowSelection,
    constraintError: error,
  });

  const { undo, redo, isUndoLoading, isRedoLoading, currentActionLabel } =
    useTableEditingUndoRedo({
      tableId,
      scope: editingScope,
      stateUpdateStrategy,
    });

  const [
    isCreateRowModalOpen,
    { open: openCreateRowModal, close: closeCreateRowModal },
  ] = useDisclosure(false);

  const { data: createRowFormDescription } = useActionFormDescription({
    actionId: BuiltInTableAction.Create,
    scope: editingScope,
  });

  const {
    opened: isUpdateRowModalOpen,
    rowIndex: updateModalRowIndex,
    rowData: updateModalRowData,
    actionFormDescription: updateActionFormDescription,
    openUpdateRowModal,
    closeUpdateRowModal,
  } = useActionUpdateRowModalFromDatasetWithObjectId({
    datasetData,
    scope: editingScope,
    currentObjectId: objectIdParam,
    onObjectIdChange: handleCurrentObjectIdChange,
  });

  const {
    isDeleteBulkRequested,
    requestDeleteBulk,
    cancelDeleteBulk,
    onDeleteBulkConfirmation,
  } = useTableBulkDeleteConfirmation({
    handleRowDeleteBulk,
    selectedRowIndices,
    setRowSelection,
  });

  const { getColumnSortDirection, handleChangeColumnSort } = useTableSorting({
    question: fakeTableQuestion,
    handleQuestionChange,
  });

  const [
    isBulkEditingRequested,
    { open: requestBulkEditing, close: closeBulkEditing },
  ] = useDisclosure();

  useMount(() => {
    dispatch(closeNavbar());
  });

  // Do not trigger leave confirmation modals on modal URL change
  const handleIsLeaveLocationAllowed = useCallback(
    (location: Location | undefined) => {
      if (
        location?.pathname.startsWith(getTableEditPathname(databaseId, tableId))
      ) {
        return true;
      }

      return false;
    },
    [databaseId, tableId],
  );

  if (!database || isLoading || !fakeTableQuestion) {
    // TODO: show loader
    return null;
  }

  if (!rawDatasetResult || !datasetData || !tableFieldMetadataMap) {
    // TODO: show error
    return null;
  }

  const shouldDisableTable = isUndoLoading || isRedoLoading;

  return (
    <>
      <Stack className={S.container} gap={0} data-testid="edit-table-data-root">
        {table && (
          <EditTableDataHeader
            database={database}
            table={table}
            question={fakeTableQuestion}
            isLoading={isFetching}
            isUndoLoading={isUndoLoading}
            isRedoLoading={isRedoLoading}
            selectedRowIndices={selectedRowIndices}
            onCreate={openCreateRowModal}
            onQuestionChange={handleQuestionChange}
            refetchTableDataQuery={refetch}
            onUndo={undo}
            onRedo={redo}
            onRequestDeleteBulk={requestDeleteBulk}
            onRequestBulkEditing={requestBulkEditing}
          />
        )}
        {isDatabaseTableEditingEnabled(database) ? (
          <>
            <Box pos="relative" className={S.gridWrapper}>
              <EditTableDataOverlay
                show={shouldDisableTable}
                message={currentActionLabel ?? ""}
              />
              <EditTableDataGrid
                data={datasetData}
                fieldMetadataMap={tableFieldMetadataMap}
                cellsWithFailedUpdatesMap={cellsWithFailedUpdatesMap}
                getColumnSortDirection={getColumnSortDirection}
                onCellValueUpdate={handleCellValueUpdate}
                onRowExpandClick={openUpdateRowModal}
                onRowSelectionChange={setRowSelection}
                hasRowSelection
                rowSelection={rowSelection}
                onColumnSort={handleChangeColumnSort}
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
                {getRowCountMessage(rawDatasetResult)}
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
      <ActionUpdateRowFormModal
        rowIndex={updateModalRowIndex}
        rowData={updateModalRowData}
        description={updateActionFormDescription}
        opened={isUpdateRowModalOpen}
        onClose={closeUpdateRowModal}
        onRowUpdate={handleRowUpdate}
        onRowDelete={handleRowDelete}
        withDelete
      />
      <ActionCreateRowFormModal
        description={createRowFormDescription}
        opened={isCreateRowModalOpen}
        onClose={closeCreateRowModal}
        isInserting={isInserting}
        onRowCreate={handleRowCreate}
      />
      <ActionBulkUpdateRowFormModal
        opened={isBulkEditingRequested}
        selectedRowIndices={selectedRowIndices}
        setRowSelection={setRowSelection}
        description={updateActionFormDescription}
        onClose={closeBulkEditing}
        onRowsUpdate={handleRowUpdateBulk}
        onRowsDelete={handleRowDeleteBulk}
        withDelete
      />
      <DeleteBulkRowConfirmationModal
        opened={isDeleteBulkRequested}
        rowCount={selectedRowIndices.length}
        isLoading={isDeleting}
        onConfirm={onDeleteBulkConfirmation}
        onClose={cancelDeleteBulk}
      />
      <UnsavedLeaveConfirmationModal
        isUpdating={isUpdating}
        isDeleting={isDeleting}
        isInserting={isInserting}
        isLocationAllowed={handleIsLeaveLocationAllowed}
      />
      <ForeignKeyConstraintModal
        opened={isForeignKeyModalOpen}
        onClose={handleForeignKeyCancel}
        onConfirm={handleForeignKeyConfirmation}
        isLoading={isDeleting}
        childRecords={foreignKeyError?.children || {}}
        message={foreignKeyError?.message}
      />
    </>
  );
};
