import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import { Flex, Title } from "metabase/ui";
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

type EditTableDataWithUpdateProps = {
  tableId: ConcreteTableId;
  data: DatasetData;
  className?: string;
  refetchTableDataQuery: () => void;
  visualizationSettings?: VisualizationSettings;
};

export const EditTableDataWithUpdate = ({
  tableId,
  data,
  className,
  refetchTableDataQuery,
  visualizationSettings,
}: EditTableDataWithUpdateProps) => {
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
  } = useTableCRUD({ tableId, datasetData: data, refetchTableDataQuery });

  const columnsConfig = useEditableTableColumnConfigFromVisualizationSettings(
    visualizationSettings,
  );

  const dataWithoutHiddenColumns = useMemo(() => {
    if (!columnsConfig) {
      return data;
    }

    const hiddenColumnIndices = new Set(
      columnsConfig.map((col, index) => (!col.enabled ? index : -1)),
    );

    return {
      ...data,
      cols: data.cols.filter((_, index) => !hiddenColumnIndices.has(index)),
      rows: data.rows.map((row) =>
        row.filter((_, index) => !hiddenColumnIndices.has(index)),
      ),
    };
  }, [data, columnsConfig]);

  if (dataWithoutHiddenColumns.cols.length === 0) {
    return (
      <Flex align="center" justify="center" h="100%">
        <Title p="md" order={2}>
          {t`No results!`}
        </Title>
      </Flex>
    );
  }

  return (
    <div className={cx(S.tableRoot, className)}>
      <EditTableDataGrid
        data={dataWithoutHiddenColumns}
        fieldMetadataMap={tableFieldMetadataMap}
        onCellValueUpdate={handleCellValueUpdate}
        onRowExpandClick={handleModalOpenAndExpandedRow}
        columnsConfig={columnsConfig}
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
