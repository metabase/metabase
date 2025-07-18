import type { Location } from "history";
import { t } from "ttag";

import { useGetDatabaseQuery } from "metabase/api";
import { GenericError } from "metabase/common/components/ErrorPages";
import { Box, Flex, Stack, Text } from "metabase/ui";

import { TableHeader } from "../common/TableHeader";
import { getRowCountMessage } from "../common/getRowCountMessage";
import { useCloseNavbarOnMount } from "../common/use-close-navbar-on-mount";
import { isDatabaseTableEditingEnabled } from "../settings";

import S from "./EditTableDataContainer.module.css";
import { EditTableDataGrid } from "./EditTableDataGrid";
import { EditTableDataHeader } from "./EditTableDataHeader";
import { EditTableDataOverlay } from "./EditTableDataOverlay";
import { useEditTableData } from "./use-edit-table-data";
import { useEditTableLoadingOverlay } from "./use-edit-table-loading-overlay";
import { useEditingTableRowSelection } from "./use-table-row-selection";

type EditTableDataContainerProps = {
  params: {
    dbId: string;
    tableId: string;
    objectId?: string;
  };
  location: Location<{ filter?: string }>;
};

export const EditTableDataContainer = ({
  params: { dbId: dbIdParam, tableId: tableIdParam },
  location,
}: EditTableDataContainerProps) => {
  useCloseNavbarOnMount();

  const databaseId = parseInt(dbIdParam, 10);
  const tableId = parseInt(tableIdParam, 10);

  const { data: database } = useGetDatabaseQuery({ id: databaseId });
  const {
    data: dataset,
    isLoading,
    isFetching,
    tableQuestion,
    getColumnSortDirection,
    handleTableQuestionChange,
    handleChangeColumnSort,
  } = useEditTableData({
    tableId,
    databaseId,
    location,
  });

  const { enabled: showLoadingOverlay, message: loadingOverlayMessage } =
    useEditTableLoadingOverlay({
      isDatasetLoading: isLoading,
      isDatasetFetching: isFetching,
    });

  const { rowSelection, setRowSelection } = useEditingTableRowSelection();

  // eslint-disable-next-line no-constant-condition
  if (database && !isDatabaseTableEditingEnabled(database) && false) {
    return (
      <Stack gap={0} data-testid="edit-table-data-root" className={S.container}>
        <TableHeader
          databaseId={databaseId}
          tableId={tableId}
          showEditBreadcrumb
        />
        <GenericError
          title={t`Table editing is not enabled for this database`}
          message={t`Please ask your admin to enable table editing`}
          details={undefined}
        />
      </Stack>
    );
  }

  return (
    <Stack gap={0} data-testid="edit-table-data-root" className={S.container}>
      <EditTableDataHeader
        databaseId={databaseId}
        tableId={tableId}
        question={tableQuestion}
        onQuestionChange={handleTableQuestionChange}
      />
      <Box pos="relative" className={S.gridWrapper}>
        <EditTableDataOverlay
          show={showLoadingOverlay}
          message={loadingOverlayMessage ?? ""}
        />
        {dataset && (
          <EditTableDataGrid
            data={dataset.data}
            getColumnSortDirection={getColumnSortDirection}
            onColumnSort={handleChangeColumnSort}
            onRowExpandClick={() => {}}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            hasRowSelection
          />
        )}
      </Box>

      {dataset && (
        <Flex className={S.gridFooter}>
          <Text fw="bold" size="md" c="inherit" component="span">
            {getRowCountMessage(dataset)}
          </Text>
        </Flex>
      )}
    </Stack>
  );

  //         <EditTableDataGrid
  //           data={datasetData}
  //           fieldMetadataMap={tableFieldMetadataMap}
  //           cellsWithFailedUpdatesMap={cellsWithFailedUpdatesMap}
  //           getColumnSortDirection={getColumnSortDirection}
  //           onCellValueUpdate={handleCellValueUpdate}
  //           onRowExpandClick={openUpdateRowModal}
  //           onRowSelectionChange={setRowSelection}
  //           hasRowSelection
  //           rowSelection={rowSelection}
  //           onColumnSort={handleChangeColumnSort}
  //         />
  //       </Box>
  //       <Flex
  //         py="0.5rem"
  //         px="1.5rem"
  //         h="2.5rem"
  //         justify="flex-end"
  //         align="center"
  //         className={S.gridFooter}
  //       >
  //         <Text fw="bold" size="md" c="inherit" component="span">
  //           {getRowCountMessage(rawDatasetResult)}
  //         </Text>
  //       </Flex>
  //     </Stack>
  //   );
};
