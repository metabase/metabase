import cx from "classnames";

import type { ConcreteTableId, DatasetData } from "metabase-types/api";

import S from "./EditTableData.module.css";
import { EditTableDataGrid } from "./EditTableDataGrid";
import { EditingBaseRowModal } from "./modals/EditingBaseRowModal";
import { useTableCRUD } from "./use-table-crud";

type EditTableDataWithUpdateProps = {
  tableId: ConcreteTableId;
  data: DatasetData;
  className?: string;
  refetchTableDataQuery: () => void;
};

export const EditTableDataWithUpdate = ({
  tableId,
  data,
  className,
  refetchTableDataQuery,
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

  return (
    <div className={cx(S.tableRoot, className)}>
      <EditTableDataGrid
        data={data}
        fieldMetadataMap={tableFieldMetadataMap}
        onCellValueUpdate={handleCellValueUpdate}
        onRowExpandClick={handleModalOpenAndExpandedRow}
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
