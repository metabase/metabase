import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { memo, useCallback, useEffect, useMemo } from "react";
import { push } from "react-router-redux";
import { useLocation } from "react-use";
import { t } from "ttag";

import Modal from "metabase/components/Modal";
import { NoDataError } from "metabase/components/errors/NoDataError";
import { useDispatch } from "metabase/lib/redux";
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  rem,
} from "metabase/ui";
import { ShortMessage } from "metabase/visualizations/components/Visualization/NoResultsView/NoResultsView.styled";
import { useBuiltInActions } from "metabase-enterprise/data_editing/actions/use-built-in-actions";
import { canEditField } from "metabase-enterprise/data_editing/helpers";
import { TableActionExecuteModalContent } from "metabase-enterprise/table-actions/execution/TableActionExecuteModalContent";
import { useTableActionsExecute } from "metabase-enterprise/table-actions/execution/use-table-actions-execute";
import type Question from "metabase-lib/v1/Question";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";
import { formatRowCount } from "metabase-lib/v1/queries/utils/row-count";
import type {
  ConcreteTableId,
  DashCardVisualizationSettings,
  DatasetData,
  TableActionDisplaySettings,
} from "metabase-types/api";

import { BuiltInTableAction } from "../types";

import S from "./EditTableData.module.css";
import { EditTableDataGrid } from "./EditTableDataGrid";
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
import { useEditableTableColumnConfigFromVisualizationSettings } from "./use-editable-column-config";
import { useActionFormDescription } from "./use-table-action-form-description";
import { useTableCRUD } from "./use-table-crud";
import { useEditingTableRowSelection } from "./use-table-row-selection";
import { useTableSorting } from "./use-table-sorting";
import { useTableEditingStateDashcardUpdateStrategy } from "./use-table-state-dashcard-update-strategy";
import { useTableEditingUndoRedo } from "./use-table-undo-redo";

type EditTableDashcardVisualizationProps = {
  title: string;
  dashcardId: number;
  cardId: number;
  tableId: ConcreteTableId;
  data: DatasetData;
  className?: string;
  visualizationSettings?: DashCardVisualizationSettings; // TODO: move editable table viz settings type to Card Visualization
  question: Question;
  withLeaveUnsavedConfirmation?: boolean;
  isEditing?: boolean;
};

export const EditTableDashcardVisualization = memo(
  ({
    title,
    dashcardId,
    cardId,
    tableId,
    data,
    className,
    visualizationSettings,
    question,
    withLeaveUnsavedConfirmation = true,
    isEditing,
  }: EditTableDashcardVisualizationProps) => {
    const dispatch = useDispatch();

    const location = useLocation();
    const objectIdParam = useMemo(() => {
      const searchParams = new URLSearchParams(location.search);
      const objectIdParam = searchParams.get("objectId");
      const parsedParams = parseModalCompositeObjectId(objectIdParam);

      if (parsedParams?.dashcardId === dashcardId) {
        return parsedParams.objectId ?? undefined;
      }

      return undefined;
    }, [location.search, dashcardId]);

    const handleCurrentObjectIdChange = useCallback(
      (objectId?: string) => {
        const searchParams = new URLSearchParams(location.search);

        if (objectId) {
          searchParams.set(
            "objectId",
            getModalCompositeObjectId(objectId, dashcardId),
          );
        } else {
          searchParams.delete("objectId");
        }

        dispatch(
          push({
            ...location,
            search: "?" + searchParams.toString(),
          }),
        );
      },
      [location, dispatch, dashcardId],
    );

    const stateUpdateStrategy = useTableEditingStateDashcardUpdateStrategy(
      dashcardId,
      cardId,
    );

    const editingScope = useMemo(() => {
      return { "dashcard-id": dashcardId };
    }, [dashcardId]);

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
      datasetData: data,
      stateUpdateStrategy,
    });

    const {
      opened: isUpdateRowModalOpen,
      rowIndex: updateModalRowIndex,
      rowData: updateModalRowData,
      actionFormDescription: updateActionFormDescription,
      refetchActionFormDescription: refetchUpdateRowFormDescription,
      openUpdateRowModal,
      closeUpdateRowModal,
    } = useActionUpdateRowModalFromDatasetWithObjectId({
      datasetData: data,
      scope: editingScope,
      fetchOnMount: false,
      currentObjectId: objectIdParam,
      onObjectIdChange: handleCurrentObjectIdChange,
    });

    const { undo, redo, isUndoLoading, isRedoLoading, currentActionLabel } =
      useTableEditingUndoRedo({
        tableId,
        scope: editingScope,
        stateUpdateStrategy,
      });

    const columnsConfig = useEditableTableColumnConfigFromVisualizationSettings(
      visualizationSettings,
    );

    const { hasCreateAction, hasUpdateAction, hasDeleteAction } =
      useBuiltInActions(
        visualizationSettings?.["editableTable.enabledActions"],
      );

    const hasEditableAndVisibleColumns = useMemo(() => {
      return data.cols.some(
        (column) =>
          !columnsConfig?.isColumnReadonly(column.name) &&
          !columnsConfig?.isColumnHidden(column.name) &&
          canEditField(tableFieldMetadataMap[column.name]),
      );
    }, [data.cols, tableFieldMetadataMap, columnsConfig]);
    const hasBulkEditing = hasEditableAndVisibleColumns;

    const {
      tableActions,
      handleTableActionRun,
      selectedTableActionState,
      handleExecuteActionModalClose,
    } = useTableActionsExecute({
      actionsVizSettings: visualizationSettings?.[
        "editableTable.enabledActions"
      ] as TableActionDisplaySettings[] | undefined,
      datasetData: data,
    });

    const { rowSelection, selectedRowIndices, setRowSelection } =
      useEditingTableRowSelection();

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

    const isActionExecuteModalOpen = !!selectedTableActionState;

    const { getColumnSortDirection } = useTableSorting({
      question,
    });

    const [
      isBulkEditingRequested,
      { open: requestBulkEditing, close: closeBulkEditing },
    ] = useDisclosure();

    const [
      isCreateRowModalOpen,
      { open: openCreateRowModal, close: closeCreateRowModal },
    ] = useDisclosure(false);

    const {
      data: createRowFormDescription,
      refetch: refetchCreateRowFormDescription,
    } = useActionFormDescription({
      actionId: BuiltInTableAction.Create,
      scope: editingScope,
      fetchOnMount: false,
    });

    useEffect(() => {
      if (isEditing) {
        return;
      }

      refetchUpdateRowFormDescription();

      if (hasCreateAction) {
        refetchCreateRowFormDescription();
      }
    }, [
      visualizationSettings, // refetch on visualizationSettings change
      hasCreateAction,
      isEditing,
      refetchCreateRowFormDescription,
      refetchUpdateRowFormDescription,
    ]);

    const shouldDisableActions = isUndoLoading || isRedoLoading;

    return (
      <Stack className={cx(S.container, className)} gap={0}>
        <Flex
          p="0.5rem"
          px="1rem"
          style={{ borderBottom: "1px solid var(--mb-color-border)" }}
          justify="space-between"
          align="center"
        >
          <Group gap="sm" align="center">
            <Text fw="bold">{title}</Text>
            {!hasUpdateAction && <Icon name="lock" />}
          </Group>

          {!isEditing && (
            <Group gap="sm" align="center">
              {hasBulkEditing && (
                <ActionIcon
                  size="md"
                  onClick={requestBulkEditing}
                  disabled={shouldDisableActions || !selectedRowIndices.length}
                >
                  <Icon
                    name="pencil"
                    tooltip={
                      selectedRowIndices.length
                        ? t`Edit selected records`
                        : t`Select records to edit`
                    }
                  />
                </ActionIcon>
              )}
              {hasDeleteAction && (
                <ActionIcon
                  size="md"
                  onClick={requestDeleteBulk}
                  disabled={shouldDisableActions || !selectedRowIndices.length}
                >
                  <Icon
                    name="trash"
                    tooltip={
                      selectedRowIndices.length
                        ? t`Delete selected records`
                        : t`Select records to delete`
                    }
                  />
                </ActionIcon>
              )}
              {(hasBulkEditing || hasDeleteAction) && (
                <Box h={rem(16)}>
                  <Divider orientation="vertical" h="100%" />
                </Box>
              )}
              <ActionIcon
                size="md"
                onClick={undo}
                disabled={shouldDisableActions}
                loading={isUndoLoading}
              >
                <Icon name="undo" tooltip={t`Undo changes`} />
              </ActionIcon>
              <ActionIcon
                size="md"
                onClick={redo}
                disabled={shouldDisableActions}
                loading={isRedoLoading}
              >
                <Icon name="redo" tooltip={t`Redo changes`} />
              </ActionIcon>
              {hasCreateAction && (
                <>
                  <Box h={rem(16)}>
                    <Divider orientation="vertical" h="100%" />
                  </Box>
                  <ActionIcon
                    size="md"
                    onClick={openCreateRowModal}
                    disabled={shouldDisableActions}
                  >
                    <Icon name="add" tooltip={t`New record`} />
                  </ActionIcon>
                </>
              )}
            </Group>
          )}
        </Flex>
        {data.rows.length === 0 ? (
          <Stack
            h="100%"
            justify="center"
            align="center"
            c="var(--mb-color-text-tertiary)"
          >
            <NoDataError data-testid="no-results-image" />
            <ShortMessage>{t`No results!`}</ShortMessage>
            <Button
              leftSection={<Icon name="add" />}
              variant="filled"
              onClick={openCreateRowModal}
              disabled={shouldDisableActions}
            >{t`New Record`}</Button>
          </Stack>
        ) : (
          <>
            <Box pos="relative" className={S.gridWrapper}>
              <EditTableDataOverlay
                show={shouldDisableActions}
                message={currentActionLabel ?? ""}
              />
              <EditTableDataGrid
                data={data}
                fieldMetadataMap={tableFieldMetadataMap}
                cellsWithFailedUpdatesMap={cellsWithFailedUpdatesMap}
                onCellValueUpdate={handleCellValueUpdate}
                onRowExpandClick={openUpdateRowModal}
                columnsConfig={columnsConfig}
                getColumnSortDirection={getColumnSortDirection}
                rowActions={tableActions}
                onActionRun={handleTableActionRun}
                rowSelection={rowSelection}
                onRowSelectionChange={setRowSelection}
              />
            </Box>

            <Flex
              p="xs"
              px="1rem"
              justify="flex-end"
              align="center"
              className={S.gridFooterDashcardVisualization}
            >
              <Text fz="sm" fw="bold">
                {getEditTableRowCountMessage(data)}
              </Text>
            </Flex>
          </>
        )}
        <ActionCreateRowFormModal
          description={createRowFormDescription}
          opened={isCreateRowModalOpen}
          onClose={closeCreateRowModal}
          isInserting={isInserting}
          onRowCreate={handleRowCreate}
        />
        <ActionUpdateRowFormModal
          rowIndex={updateModalRowIndex}
          rowData={updateModalRowData}
          description={updateActionFormDescription}
          opened={isUpdateRowModalOpen}
          onClose={closeUpdateRowModal}
          onRowUpdate={handleRowUpdate}
          onRowDelete={handleRowDelete}
          withDelete={hasDeleteAction}
        />
        <ActionBulkUpdateRowFormModal
          opened={isBulkEditingRequested}
          selectedRowIndices={selectedRowIndices}
          setRowSelection={setRowSelection}
          description={updateActionFormDescription}
          onClose={closeBulkEditing}
          onRowsUpdate={handleRowUpdateBulk}
          onRowsDelete={handleRowDeleteBulk}
          withDelete={hasDeleteAction}
        />
        <Modal
          isOpen={isActionExecuteModalOpen}
          onClose={handleExecuteActionModalClose}
        >
          {selectedTableActionState && (
            <TableActionExecuteModalContent
              actionId={selectedTableActionState.actionId}
              scope={editingScope}
              initialValues={selectedTableActionState.rowData}
              actionOverrides={selectedTableActionState.actionOverrides}
              onClose={handleExecuteActionModalClose}
            />
          )}
        </Modal>
        <DeleteBulkRowConfirmationModal
          opened={isDeleteBulkRequested}
          rowCount={selectedRowIndices.length}
          isLoading={isDeleting}
          onConfirm={onDeleteBulkConfirmation}
          onClose={cancelDeleteBulk}
        />
        {withLeaveUnsavedConfirmation && (
          <UnsavedLeaveConfirmationModal
            isUpdating={isUpdating}
            isDeleting={isDeleting}
            isInserting={isInserting}
          />
        )}
        <ForeignKeyConstraintModal
          opened={isForeignKeyModalOpen}
          onClose={handleForeignKeyCancel}
          onConfirm={handleForeignKeyConfirmation}
          isLoading={isDeleting}
          childRecords={foreignKeyError?.children || {}}
          message={foreignKeyError?.message}
        />
      </Stack>
    );
  },
);
EditTableDashcardVisualization.displayName = "EditTableDashcardVisualization";

function getEditTableRowCountMessage(data: DatasetData): string {
  const rowCount = data.rows.length;

  if (data.rows_truncated > 0) {
    return t`Showing first ${formatRowCount(rowCount)}`;
  }
  if (rowCount === HARD_ROW_LIMIT) {
    return t`Showing first ${HARD_ROW_LIMIT} rows`;
  }
  return t`Showing ${formatRowCount(rowCount)}`;
}

const MODAL_COMPOSITE_OBJECT_ID_SEPARATOR = "_";
function getModalCompositeObjectId(objectId: string, dashcardId: number) {
  return `${dashcardId}${MODAL_COMPOSITE_OBJECT_ID_SEPARATOR}${objectId}`;
}

function parseModalCompositeObjectId(compositeObjectId: string | null) {
  if (!compositeObjectId) {
    return undefined;
  }

  // objectId can contain separator symbol itself, so we should slice the first part
  const separatorIndex = compositeObjectId.indexOf(
    MODAL_COMPOSITE_OBJECT_ID_SEPARATOR,
  );
  if (separatorIndex === -1) {
    return undefined;
  }

  const dashcardId = compositeObjectId.slice(0, separatorIndex);
  const objectId = compositeObjectId.slice(separatorIndex + 1);

  return { dashcardId: parseInt(dashcardId), objectId };
}
