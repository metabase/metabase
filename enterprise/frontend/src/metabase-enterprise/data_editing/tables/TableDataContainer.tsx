import { useCallback } from "react";
import { useMount } from "react-use";

import {
  useGetDatabaseMetadataQuery,
  useGetTableDataQuery,
  useGetTableQuery,
} from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { closeNavbar } from "metabase/redux/app";
import { Box, Flex } from "metabase/ui";
import { useUpdateTableRowsMutation } from "metabase-enterprise/api";
import { isPK } from "metabase-lib/v1/types/utils/isa";

import { TableDataView } from "./TableDataView";
import S from "./TableDataView.module.css";
import { TableDataViewHeader } from "./TableDataViewHeader";
import type { UpdatedRowCellsHandlerParams } from "./types";

type TableDataViewProps = {
  params: {
    dbId: string;
    tableId: string;
  };
};

export const TableDataContainer = ({
  params: { dbId: dbIdParam, tableId: tableIdParam },
}: TableDataViewProps) => {
  const dbId = parseInt(dbIdParam, 10);
  const tableId = parseInt(tableIdParam, 10);

  const dispatch = useDispatch();

  const { data: database } = useGetDatabaseMetadataQuery({ id: dbId }); // TODO: consider using just "dbId" to avoid extra data request
  const { data: table } = useGetTableQuery({ id: tableId });

  const {
    data: datasetData,
    isLoading,
    refetch: refetchTableDataQuery,
  } = useGetTableDataQuery({
    tableId,
  });

  const [updateTableRows] = useUpdateTableRowsMutation();

  useMount(() => {
    dispatch(closeNavbar());
  });

  const handleCellValueUpdate = useCallback(
    async ({ data, rowIndex }: UpdatedRowCellsHandlerParams) => {
      if (!datasetData) {
        console.warn(
          "Failed to update table data - no data is loaded for a table",
        );
        return;
      }

      const columns = datasetData.data.cols;
      const rowData = datasetData.data.rows[rowIndex];

      const pkColumnIndex = columns.findIndex(isPK);
      const pkColumn = columns[pkColumnIndex];
      const rowPkValue = rowData[pkColumnIndex];

      const updatedRowWithPk = {
        ...data,
        [pkColumn.name]: rowPkValue,
      };

      await updateTableRows({
        tableId: tableId,
        rows: [updatedRowWithPk],
      });

      // TODO: do an optimistic data update here using RTK cache

      refetchTableDataQuery();
    },
    [datasetData, refetchTableDataQuery, tableId, updateTableRows],
  );

  if (isLoading) {
    // TODO: show loader
    return null;
  }

  if (!datasetData) {
    // TODO: show error
    return null;
  }

  return (
    <Flex
      className={S.container}
      data-testid="table-data-view-root"
      direction="column"
      justify="stretch"
    >
      {database && table && (
        <TableDataViewHeader
          database={database}
          tableName={table?.display_name}
        />
      )}
      <Box pos="relative" className={S.gridWrapper}>
        <TableDataView
          data={datasetData}
          onCellValueUpdate={handleCellValueUpdate}
        />
      </Box>
    </Flex>
  );
};
