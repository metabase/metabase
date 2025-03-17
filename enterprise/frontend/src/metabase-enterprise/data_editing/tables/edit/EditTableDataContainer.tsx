import { useCallback } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import {
  useGetDatabaseMetadataQuery,
  useGetTableDataQuery,
  useGetTableQuery,
} from "metabase/api";
import { GenericError } from "metabase/components/ErrorPages";
import { useDispatch } from "metabase/lib/redux";
import { closeNavbar } from "metabase/redux/app";
import { Box, Flex, Stack, Text } from "metabase/ui";
import { useUpdateTableRowsMutation } from "metabase-enterprise/api";
import { isDatabaseTableEditingEnabled } from "metabase-enterprise/data_editing/settings";
import { getRowCountMessage } from "metabase-lib/v1/queries/utils/row-count";
import { isPK } from "metabase-lib/v1/types/utils/isa";

import type { UpdatedRowCellsHandlerParams } from "../types";

import S from "./EditTableData.module.css";
import { EditTableDataGrid } from "./EditTableDataGrid";
import { EditTableDataHeader } from "./EditTableDataHeader";

type EditTableDataContainerProps = {
  params: {
    dbId: string;
    tableId: string;
  };
};

export const EditTableDataContainer = ({
  params: { dbId: dbIdParam, tableId: tableIdParam },
}: EditTableDataContainerProps) => {
  const dbId = parseInt(dbIdParam, 10);
  const tableId = parseInt(tableIdParam, 10);

  const dispatch = useDispatch();

  const { data: database } = useGetDatabaseMetadataQuery({ id: dbId }); // TODO: consider using just "dbId" to avoid extra data request
  const { data: table, isLoading: tableIdLoading } = useGetTableQuery({
    id: tableId,
  });

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

  const handleNewRowCreate = () => {};
  const handleRowsDelete = () => {};

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

  if (!database || isLoading || tableIdLoading) {
    // TODO: show loader
    return null;
  }

  if (!datasetData) {
    // TODO: show error
    return null;
  }

  return (
    <Stack className={S.container} gap={0} data-testid="edit-table-data-root">
      {table && (
        <EditTableDataHeader
          table={table}
          onCreate={handleNewRowCreate}
          onDelete={handleRowsDelete}
        />
      )}
      {isDatabaseTableEditingEnabled(database) ? (
        <>
          <Box pos="relative" className={S.gridWrapper}>
            <EditTableDataGrid
              data={datasetData}
              onCellValueUpdate={handleCellValueUpdate}
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
              {getRowCountMessage(datasetData)}
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
  );
};
