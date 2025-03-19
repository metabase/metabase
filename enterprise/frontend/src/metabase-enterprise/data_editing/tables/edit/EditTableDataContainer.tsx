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
import { isDatabaseTableEditingEnabled } from "metabase-enterprise/data_editing/settings";
import { EditTableDataWithUpdate } from "metabase-enterprise/data_editing/tables/edit/EditTableDataWithUpdate";
import { getRowCountMessage } from "metabase-lib/v1/queries/utils/row-count";

import S from "./EditTableData.module.css";
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

  useMount(() => {
    dispatch(closeNavbar());
  });

  const handleNewRowCreate = () => {};
  const handleRowsDelete = () => {};

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
            <EditTableDataWithUpdate
              data={datasetData.data}
              tableId={tableId}
              refetchTableDataQuery={refetchTableDataQuery}
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
