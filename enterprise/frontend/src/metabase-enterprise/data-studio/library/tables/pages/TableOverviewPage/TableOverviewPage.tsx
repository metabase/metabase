import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { TextSkeleton } from "metabase/common/components/Skeletons";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { useParams } from "metabase/router";
import { Center, Flex, Skeleton } from "metabase/ui";
import * as Urls from "metabase/urls";

import { DataStudioPageSkeleton } from "../../../components/DataStudioPageSkeleton";
import { TableHeader } from "../../components/TableHeader";

import { TableOverview } from "./TableOverview";

type TableOverviewPageParams = {
  tableId: string;
};

export function TableOverviewPage() {
  const params = useParams<TableOverviewPageParams>();
  const tableId = Urls.extractEntityId(params.tableId);
  const { table, isLoading, error } = useLoadTableWithMetadata(tableId);

  if (isLoading) {
    return (
      <DataStudioPageSkeleton icon="table" tabCount={5}>
        <Flex flex={1} gap="lg" mah={700}>
          <Skeleton flex={1} radius="md" />
          <TextSkeleton withTitle lines={4} flex="0 0 360px" />
        </Flex>
      </DataStudioPageSkeleton>
    );
  }

  if (error != null || table == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="table-overview-page">
      <TableHeader table={table} />
      <TableOverview table={table} />
    </PageContainer>
  );
}
