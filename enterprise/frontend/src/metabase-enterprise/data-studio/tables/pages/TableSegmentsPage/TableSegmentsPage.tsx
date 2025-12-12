import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center, Flex } from "metabase/ui";
import { useLoadTableWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-table-with-metadata";

import { TableHeader } from "../../components/TableHeader";

import { TableSegments } from "./TableSegments";

type TableSegmentsPageParams = {
  tableId: string;
};

type TableSegmentsPageProps = {
  params: TableSegmentsPageParams;
};

export function TableSegmentsPage({ params }: TableSegmentsPageProps) {
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
    <Flex direction="column" h="100%" data-testid="table-segments-page">
      <TableHeader table={table} />
      <TableSegments table={table} />
    </Flex>
  );
}
