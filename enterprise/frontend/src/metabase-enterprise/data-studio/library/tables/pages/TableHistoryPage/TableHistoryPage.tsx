import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { TableHistorySection } from "metabase/data-studio/data-model/pages/DataModel/TableSection/TableStructure";
import { useParams } from "metabase/router";
import { Box, Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { TableHeader } from "../../components/TableHeader";

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
    <PageContainer data-testid="table-history-page">
      <TableHeader table={table} />
      <Box maw={720}>
        <TableHistorySection table={table} readOnly={!table.can_write} />
      </Box>
    </PageContainer>
  );
}
