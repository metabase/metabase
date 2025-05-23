import cx from "classnames";
import { useCallback, useMemo } from "react";
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
import type Question from "metabase-lib/v1/Question";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";
import { formatRowCount } from "metabase-lib/v1/queries/utils/row-count";
import type {
  ConcreteTableId,
  DatasetData,
  VisualizationSettings,
  WritebackAction,
} from "metabase-types/api";

import S from "./EditTableData.module.css";
import { EditTableDataGrid } from "./EditTableDataGrid";
import { EditTableDataOverlay } from "./EditTableDataOverlay";
import { TableActionExecuteModal } from "./actions/TableActionExecuteModal";
import { useTableActions } from "./actions/use-table-actions";
import { DeleteBulkRowConfirmationModal } from "./modals/DeleteBulkRowConfirmationModal";
import { EditingBaseRowModal } from "./modals/EditingBaseRowModal";
import { UnsavedLeaveConfirmationModal } from "./modals/UnsavedLeaveConfirmationModal";
import { useTableBulkDeleteConfirmation } from "./modals/use-table-bulk-delete-confirmation";
import { useTableEditingModalControllerWithObjectId } from "./modals/use-table-modal-with-object-id";
import { useEditableTableColumnConfigFromVisualizationSettings } from "./use-editable-column-config";
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
  visualizationSettings?: VisualizationSettings;
  question: Question;
  withLeaveUnsavedConfirmation?: boolean;
  isEditing?: boolean;
};

export const EditTableDashcardVisualization = ({
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

  const {
    state: modalState,
    openCreateRowModal,
    openEditRowModal,
    closeModal,
  } = useTableEditingModalControllerWithObjectId({
    currentObjectId: objectIdParam,
    datasetData: data,
    onObjectIdChange: handleCurrentObjectIdChange,
  });

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

    handleCellValueUpdate,
    handleRowCreate,
    handleRowUpdate,
    handleRowDelete,
    handleRowDeleteBulk,
  } = useTableCRUD({
    tableId,
    scope: editingScope,
    datasetData: data,
    stateUpdateStrategy,
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

  const {
    hasCreateAction,
    hasDeleteAction,
    enabledRowActions,
    handleRowActionRun,
    activeActionState,
    handleExecuteModalClose,
  } = useTableActions({
    visualizationSettings,
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

  const isActionExecuteModalOpen = !!activeActionState;

  const { getColumnSortDirection } = useTableSorting({
    question,
  });

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
        <Text fw="bold">{title}</Text>

        {!isEditing && (
          <Group gap="sm" align="center">
            {hasDeleteAction && (
              <>
                <ActionIcon
                  size="md"
                  onClick={requestDeleteBulk}
                  disabled={shouldDisableActions || !selectedRowIndices.length}
                >
                  <Icon
                    name="trash"
                    tooltip={
                      selectedRowIndices.length
                        ? t`Delete`
                        : t`Select rows for deletion`
                    }
                  />
                </ActionIcon>
                <Box h={rem(16)}>
                  <Divider orientation="vertical" h="100%" />
                </Box>
              </>
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
              onRowExpandClick={openEditRowModal}
              columnsConfig={columnsConfig}
              getColumnSortDirection={getColumnSortDirection}
              rowActions={enabledRowActions as WritebackAction[]}
              onActionRun={handleRowActionRun}
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
      <EditingBaseRowModal
        modalState={modalState}
        onClose={closeModal}
        hasDeleteAction={hasDeleteAction}
        onEdit={handleRowUpdate}
        onRowCreate={handleRowCreate}
        onRowDelete={handleRowDelete}
        datasetColumns={data.cols}
        currentRowData={
          modalState.rowIndex !== undefined
            ? data.rows[modalState.rowIndex]
            : undefined
        }
        fieldMetadataMap={tableFieldMetadataMap}
        isLoading={isInserting}
        columnsConfig={columnsConfig}
      />
      <Modal
        isOpen={isActionExecuteModalOpen}
        onClose={handleExecuteModalClose}
      >
        {activeActionState && (
          <TableActionExecuteModal
            actionId={activeActionState.actionId}
            initialValues={activeActionState.rowData}
            actionOverrides={activeActionState.actionOverrides}
            onClose={handleExecuteModalClose}
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
    </Stack>
  );
};

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
