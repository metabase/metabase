import cx from "classnames";
import { t } from "ttag";

import { Box, Button, Flex, Icon, Stack, Text } from "metabase/ui";
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
import { EditingBaseRowModal } from "./modals/EditingBaseRowModal";
import { useEditableTableColumnConfigFromVisualizationSettings } from "./use-editable-column-config";
import { useTableActions } from "./use-table-actions";
import { useTableCRUD } from "./use-table-crud";
import { useTableSorting } from "./use-table-sorting";
import { useTableEditingStateDashcardUpdateStrategy } from "./use-table-state-dashcard-update-strategy";

type EditTableDashcardVisualizationProps = {
  dashcardId: number;
  cardId: number;
  tableId: ConcreteTableId;
  data: DatasetData;
  className?: string;
  visualizationSettings?: VisualizationSettings;
  question: Question;
};

export const EditTableDashcardVisualization = ({
  dashcardId,
  cardId,
  tableId,
  data,
  className,
  visualizationSettings,
  question,
}: EditTableDashcardVisualizationProps) => {
  const stateUpdateStrategy = useTableEditingStateDashcardUpdateStrategy(
    dashcardId,
    cardId,
  );

  const {
    isCreateRowModalOpen,
    expandedRowIndex,
    isInserting,
    closeCreateRowModal,
    tableFieldMetadataMap,

    handleRowCreate,
    handleCellValueUpdate,
    handleExpandedRowDelete,
    handleModalOpenAndExpandedRow,
  } = useTableCRUD({ tableId, datasetData: data, stateUpdateStrategy });

  const columnsConfig = useEditableTableColumnConfigFromVisualizationSettings(
    visualizationSettings,
  );

  const { hasCreateAction, hasDeleteAction } = useTableActions(
    visualizationSettings,
  );

  const { getColumnSortDirection } = useTableSorting({
    question,
  });

  return (
    <Stack className={cx(S.container, className)} gap={0}>
      <Box pos="relative" className={S.gridWrapper}>
        <EditTableDataGrid
          data={data}
          fieldMetadataMap={tableFieldMetadataMap}
          onCellValueUpdate={handleCellValueUpdate}
          onRowExpandClick={handleModalOpenAndExpandedRow}
          columnsConfig={columnsConfig}
          getColumnSortDirection={getColumnSortDirection}
        />
      </Box>

      <Flex
        p="xs"
        pr="1rem"
        justify="space-between"
        align="center"
        className={S.gridFooterDashcardVisualization}
      >
        {hasCreateAction ? (
          <Button
            variant="subtle"
            size="xs"
            fz="sm"
            leftSection={<Icon name="add" />}
            onClick={() => handleModalOpenAndExpandedRow()}
          >{t`New record`}</Button>
        ) : (
          <div />
        )}

        <Text fz="sm" fw="bold">
          {getEditTableRowCountMessage(data)}
        </Text>
      </Flex>
      <EditingBaseRowModal
        opened={isCreateRowModalOpen}
        hasDeleteAction={hasDeleteAction}
        onClose={closeCreateRowModal}
        onEdit={handleCellValueUpdate}
        onRowCreate={handleRowCreate}
        onRowDelete={handleExpandedRowDelete}
        datasetColumns={data.cols}
        currentRowIndex={expandedRowIndex}
        currentRowData={
          expandedRowIndex !== undefined
            ? data.rows[expandedRowIndex]
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
