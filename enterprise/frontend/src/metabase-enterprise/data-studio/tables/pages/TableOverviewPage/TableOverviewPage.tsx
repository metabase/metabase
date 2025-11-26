import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center, Flex } from "metabase/ui";

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
  const {
    data: table,
    isLoading,
    error,
  } = useGetTableQueryMetadataQuery(
    tableId != null ? { id: tableId } : skipToken,
  );

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
