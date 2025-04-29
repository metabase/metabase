import cx from "classnames";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Divider,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  rem,
} from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";
import { formatRowCount } from "metabase-lib/v1/queries/utils/row-count";
import type {
  ConcreteTableId,
  DatasetData,
  VisualizationSettings,
} from "metabase-types/api";

import S from "./EditTableData.module.css";
import { EditTableDataGrid } from "./EditTableDataGrid";
import { EditTableDataOverlay } from "./EditTableDataOverlay";
import { EditingBaseRowModal } from "./modals/EditingBaseRowModal";
import { useTableEditingModalController } from "./modals/use-table-modal";
import { useEditableTableColumnConfigFromVisualizationSettings } from "./use-editable-column-config";
import { useTableActions } from "./use-table-actions";
import { useTableCRUD } from "./use-table-crud";
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
}: EditTableDashcardVisualizationProps) => {
  const {
    state: modalState,
    openCreateRowModal,
    openEditRowModal,
    closeModal,
  } = useTableEditingModalController();

  const stateUpdateStrategy = useTableEditingStateDashcardUpdateStrategy(
    dashcardId,
    cardId,
  );

  const {
    isInserting,
    tableFieldMetadataMap,
    handleRowCreate,
    handleCellValueUpdate,
    handleExpandedRowDelete,
  } = useTableCRUD({
    tableId,
    datasetData: data,
    stateUpdateStrategy,
  });

  const { undo, redo, isUndoLoading, isRedoLoading, currentActionLabel } =
    useTableEditingUndoRedo({
      tableId,
      stateUpdateStrategy,
    });

  const columnsConfig = useEditableTableColumnConfigFromVisualizationSettings(
    visualizationSettings,
  );

  const { hasCreateAction, hasDeleteAction } = useTableActions(
    visualizationSettings,
  );

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

        <Group gap="sm" align="center">
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
            <Box h={rem(16)}>
              <Divider orientation="vertical" h="100%" />
            </Box>
          )}
          {hasCreateAction && (
            <ActionIcon
              size="md"
              onClick={openCreateRowModal}
              disabled={shouldDisableActions}
            >
              <Icon name="add" tooltip={t`New record`} />
            </ActionIcon>
          )}
        </Group>
      </Flex>
      <Box pos="relative" className={S.gridWrapper}>
        <EditTableDataOverlay
          show={shouldDisableActions}
          message={currentActionLabel ?? ""}
        />
        <EditTableDataGrid
          data={data}
          fieldMetadataMap={tableFieldMetadataMap}
          onCellValueUpdate={handleCellValueUpdate}
          onRowExpandClick={openEditRowModal}
          columnsConfig={columnsConfig}
          getColumnSortDirection={getColumnSortDirection}
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
      <EditingBaseRowModal
        modalState={modalState}
        onClose={closeModal}
        hasDeleteAction={hasDeleteAction}
        onEdit={handleCellValueUpdate}
        onRowCreate={handleRowCreate}
        onRowDelete={handleExpandedRowDelete}
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
