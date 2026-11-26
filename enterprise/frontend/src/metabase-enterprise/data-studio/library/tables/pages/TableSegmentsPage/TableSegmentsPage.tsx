import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import {
  DataStudioPageSkeleton,
  EntityListSkeleton,
} from "../../../components/DataStudioPageSkeleton";
import { TableHeader } from "../../components/TableHeader";

import { TableSegments } from "./TableSegments";

type TableSegmentsPageParams = {
  tableId: string;
};

export function TableSegmentsPage() {
  const params = useParams<TableSegmentsPageParams>();
  const tableId = Urls.extractEntityId(params.tableId);
  const { table, isLoading, error } = useLoadTableWithMetadata(tableId);

  if (isLoading) {
    return (
      <DataStudioPageSkeleton icon="table" tabCount={5}>
        <EntityListSkeleton />
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
    <PageContainer data-testid="table-segments-page">
      <TableHeader table={table} />
      <TableSegments table={table} />
    </PageContainer>
  );
}
