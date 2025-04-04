import { useMemo } from "react";
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
import { extractRemappedColumns } from "metabase/visualizations";
import { isDatabaseTableEditingEnabled } from "metabase-enterprise/data_editing/settings";
import { getRowCountMessage } from "metabase-lib/v1/queries/utils/row-count";

import S from "./EditTableData.module.css";
import { EditTableDataGrid } from "./EditTableDataGrid";
import { EditTableDataHeader } from "./EditTableDataHeader";
import { EditingBaseRowModal } from "./modals/EditingBaseRowModal";
import { useTableCRUD } from "./use-table-crud";

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

  const { data: database } = useGetDatabaseMetadataQuery({ id: dbId });
  const { data: table, isLoading: tableIdLoading } = useGetTableQuery({
    id: tableId,
  });

  const { data: rawDatasetResult, isLoading } = useGetTableDataQuery({
    tableId,
  });

  const datasetData = useMemo(() => {
    return rawDatasetResult
      ? extractRemappedColumns(rawDatasetResult.data)
      : undefined;
  }, [rawDatasetResult]);

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
  } = useTableCRUD({ tableId, datasetData });

  useMount(() => {
    dispatch(closeNavbar());
  });

  if (!database || isLoading || tableIdLoading) {
    // TODO: show loader
    return null;
  }

  if (!rawDatasetResult || !datasetData || !tableFieldMetadataMap) {
    // TODO: show error
    return null;
  }

  return (
    <>
      <Stack className={S.container} gap={0} data-testid="edit-table-data-root">
        {table && (
          <EditTableDataHeader
            table={table}
            onCreate={handleModalOpenAndExpandedRow}
          />
        )}
        {isDatabaseTableEditingEnabled(database) ? (
          <>
            <Box pos="relative" className={S.gridWrapper}>
              <EditTableDataGrid
                data={datasetData}
                fieldMetadataMap={tableFieldMetadataMap}
                onCellValueUpdate={handleCellValueUpdate}
                onRowExpandClick={handleModalOpenAndExpandedRow}
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
                {getRowCountMessage(rawDatasetResult)}
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
      <EditingBaseRowModal
        opened={isCreateRowModalOpen}
        onClose={closeCreateRowModal}
        onEdit={handleCellValueUpdate}
        onRowCreate={handleRowCreate}
        onRowDelete={handleExpandedRowDelete}
        datasetColumns={datasetData.cols}
        currentRowIndex={expandedRowIndex}
        currentRowData={
          expandedRowIndex !== undefined
            ? datasetData.rows[expandedRowIndex]
            : undefined
        }
        fieldMetadataMap={tableFieldMetadataMap}
        isLoading={isInserting}
      />
    </>
  );
};
