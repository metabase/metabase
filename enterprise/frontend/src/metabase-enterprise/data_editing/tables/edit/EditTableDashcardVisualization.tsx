import cx from "classnames";

import type Question from "metabase-lib/v1/Question";
import type {
  ConcreteTableId,
  DatasetData,
  VisualizationSettings,
} from "metabase-types/api";

import S from "./EditTableData.module.css";
import { EditTableDataGrid } from "./EditTableDataGrid";
import { EditingBaseRowModal } from "./modals/EditingBaseRowModal";
import { useEditableTableColumnConfigFromVisualizationSettings } from "./use-editable-column-config";
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

  const { getColumnSortDirection } = useTableSorting({
    question,
  });

  return (
    <div className={cx(S.tableRoot, className)}>
      <EditTableDataGrid
        data={data}
        fieldMetadataMap={tableFieldMetadataMap}
        onCellValueUpdate={handleCellValueUpdate}
        onRowExpandClick={handleModalOpenAndExpandedRow}
        columnsConfig={columnsConfig}
        getColumnSortDirection={getColumnSortDirection}
      />
      <EditingBaseRowModal
        opened={isCreateRowModalOpen}
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
      />
    </div>
  );
};
