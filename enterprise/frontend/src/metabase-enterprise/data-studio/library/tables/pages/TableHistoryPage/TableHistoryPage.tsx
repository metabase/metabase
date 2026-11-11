import { t } from "ttag";

import { DatabaseInfoSection } from "metabase/admin/databases/components/DatabaseInfoSection";
import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { HistorySummary } from "metabase/data-studio/data-model/pages/DataModel/TableSection/TableHistory";
import { useParams } from "metabase/router";
import { Button, Center, Flex, Icon, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";

import { TableHeader } from "../../components/TableHeader";
import { TableListBody } from "../../components/TableListBody";

type TableHistoryPageParams = {
  tableId: string;
};

/**
 * What a published history table's versions look like, read-only. The setup
 * is structure, like the table's role, so it's edited in Connected data for
 * every table, published or not.
 */
export function TableHistoryPage() {
  const params = useParams<TableHistoryPageParams>();
  const tableId = Urls.extractEntityId(params.tableId);
  const { table, isLoading, error } = useLoadTableWithMetadata(tableId);

  if (isLoading || error != null || table == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  const connectedDataUrl = Urls.dataStudioData({
    databaseId: table.db_id,
    schemaName: table.schema,
    tableId: table.id,
    tab: "history",
  });

  return (
    <PageContainer data-testid="table-history-page" gap="lg" px={0} pb={0}>
      <TableHeader table={table} px="3.5rem" />
      <TableListBody>
        <Flex direction="column" w="100%" maw="64.25rem" mx="auto">
          <DatabaseInfoSection
            name={t`How this table keeps history`}
            description={t`Set up in Connected data, because it changes how every query on this table counts and filters its rows.`}
            contentPx="xxxl"
          >
            <Stack gap="xxl">
              <HistorySummary table={table} />
              <Button
                component={ForwardRefLink}
                to={connectedDataUrl}
                w="fit-content"
                rightSection={<Icon name="arrow_right" />}
              >
                {t`Edit in Connected data`}
              </Button>
            </Stack>
          </DatabaseInfoSection>
        </Flex>
      </TableListBody>
    </PageContainer>
  );
}
