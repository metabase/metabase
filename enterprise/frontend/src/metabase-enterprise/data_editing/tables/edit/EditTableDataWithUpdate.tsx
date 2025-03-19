import { useCallback } from "react";

import { useUpdateTableRowsMutation } from "metabase-enterprise/api";
import { EditTableDataGrid } from "metabase-enterprise/data_editing/tables/edit/EditTableDataGrid";
import type { UpdatedRowCellsHandlerParams } from "metabase-enterprise/data_editing/tables/types";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { ConcreteTableId, DatasetData } from "metabase-types/api";

type EditTableDataWithUpdateProps = {
  data: DatasetData;
  tableId: ConcreteTableId;
  refetchTableDataQuery: () => void;
};

export const EditTableDataWithUpdate = ({
  data,
  tableId,
  refetchTableDataQuery,
}: EditTableDataWithUpdateProps) => {
  const [updateTableRows] = useUpdateTableRowsMutation();

  const handleCellValueUpdate = useCallback(
    async ({ updatedData, rowIndex }: UpdatedRowCellsHandlerParams) => {
      if (!data) {
        console.warn(
          "Failed to update table data - no data is loaded for a table",
        );
        return;
      }

      const columns = data.cols;
      const rowData = data.rows[rowIndex];

      const pkColumnIndex = columns.findIndex(isPK);
      const pkColumn = columns[pkColumnIndex];
      const rowPkValue = rowData[pkColumnIndex];

      const updatedRowWithPk = {
        ...updatedData,
        [pkColumn.name]: rowPkValue,
      };

      await updateTableRows({
        tableId,
        rows: [updatedRowWithPk],
      });

      // TODO: do an optimistic data update here using RTK cache

      refetchTableDataQuery();
    },
    [data, refetchTableDataQuery, tableId, updateTableRows],
  );

  return (
    <EditTableDataGrid data={data} onCellValueUpdate={handleCellValueUpdate} />
  );
};
