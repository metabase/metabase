import { t } from "ttag";

import { DatabaseInfoSection } from "metabase/admin/databases/components/DatabaseInfoSection";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { TableHistorySection } from "metabase/data-studio/data-model/pages/DataModel/TableSection/TableStructure";
import { useParams } from "metabase/router";
import { Center, Flex } from "metabase/ui";
import * as Urls from "metabase/urls";

import { TableHeader } from "../../components/TableHeader";
import { TableListBody } from "../../components/TableListBody";

type TableHistoryPageParams = {
  tableId: string;
};

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

  return (
    <PageContainer data-testid="table-history-page" gap="lg" px={0} pb={0}>
      <TableHeader table={table} px="3.5rem" />
      <TableListBody>
        <Flex direction="column" w="100%" maw="64.25rem" mx="auto">
          <DatabaseInfoSection
            name={t`How this table keeps history`}
            description={t`The same settings as Connected data's History tab. Changes apply to every query on this table.`}
            contentPx="xxxl"
          >
            <TableHistorySection table={table} readOnly={!table.can_write} />
          </DatabaseInfoSection>
        </Flex>
      </TableListBody>
    </PageContainer>
  );
}
