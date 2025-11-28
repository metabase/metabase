import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center, Flex } from "metabase/ui";
import { useLoadTableWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-table-with-metadata";

import { TableHeader } from "../../components/TableHeader";

import { TableOverview } from "./TableOverview";

type TableOverviewPageParams = {
  tableId: string;
};

type TableOverviewPageProps = {
  params: TableOverviewPageParams;
};

export function TableOverviewPage({ params }: TableOverviewPageProps) {
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
    <Flex direction="column" h="100%" data-testid="table-overview-page">
      <TableHeader table={table} />
      <TableOverview table={table} />
    </Flex>
  );
}
