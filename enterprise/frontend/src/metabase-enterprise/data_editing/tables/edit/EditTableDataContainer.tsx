import { useEffect, useMemo, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetDatabaseQuery,
  useGetTableQuery,
} from "metabase/api";
import { GenericError } from "metabase/components/ErrorPages";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { loadMetadataForTable } from "metabase/questions/actions";
import { closeNavbar } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Flex, Stack, Text } from "metabase/ui";
import { extractRemappedColumns } from "metabase/visualizations";
import { isDatabaseTableEditingEnabled } from "metabase-enterprise/data_editing/settings";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { getRowCountMessage } from "metabase-lib/v1/queries/utils/row-count";

import S from "./EditTableData.module.css";
import { EditTableDataGrid } from "./EditTableDataGrid";
import { EditTableDataHeader } from "./EditTableDataHeader";
import { EditingBaseRowModal } from "./modals/EditingBaseRowModal";
import { useTableCRUD } from "./use-table-crud";
import { useTableEditingStateApiUpdateStrategy } from "./use-table-state-api-update-strategy";

type EditTableDataContainerProps = {
  params: {
    dbId: string;
    tableId: string;
  };
};

export const EditTableDataContainer = ({
  params: { dbId: dbIdParam, tableId: tableIdParam },
}: EditTableDataContainerProps) => {
  const databaseId = parseInt(dbIdParam, 10);
  const tableId = parseInt(tableIdParam, 10);

  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);

  const { data: database } = useGetDatabaseQuery({ id: databaseId });

  // todo get table data from metadata, as we have to load it separately
  const { data: table, isLoading: tableIsLoading } = useGetTableQuery({
    id: tableId,
  });

  const [fakeTableQuestion, setFakeTableQuestion] = useState<
    Question | undefined
  >();

  const { data: rawDatasetResult, isLoading } = useGetAdhocQueryQuery(
    fakeTableQuestion
      ? Lib.toLegacyQuery(fakeTableQuestion.query())
      : skipToken,
  );

  const datasetData = useMemo(() => {
    return rawDatasetResult
      ? extractRemappedColumns(rawDatasetResult.data)
      : undefined;
  }, [rawDatasetResult]);

  const stateUpdateStrategy = useTableEditingStateApiUpdateStrategy(
    fakeTableQuestion
      ? Lib.toLegacyQuery(fakeTableQuestion.query())
      : undefined,
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
  } = useTableCRUD({ tableId, datasetData, stateUpdateStrategy });

  useMount(() => {
    dispatch(closeNavbar());
  });

  useEffect(() => {
    dispatch(loadMetadataForTable(tableId));
  }, [dispatch, tableId]);

  // useEffect(() => {
  //   if (fakeTableQuestion) {
  //     dispatch(loadMetadataForCard(fakeTableQuestion.card()));
  //   }
  // }, [dispatch, fakeTableQuestion]);

  useEffect(() => {
    const tableMetadata = metadata.table(tableId);

    if (tableMetadata) {
      const question = Question.create({ databaseId, tableId, metadata });
      setFakeTableQuestion(question);
    }
  }, [databaseId, metadata, tableId]);

  if (!database || isLoading || tableIsLoading || !fakeTableQuestion) {
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
            question={fakeTableQuestion}
            onCreate={handleModalOpenAndExpandedRow}
            onQuestionChange={setFakeTableQuestion}
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
