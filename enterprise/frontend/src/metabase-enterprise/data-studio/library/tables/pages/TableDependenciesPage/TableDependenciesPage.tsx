import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Outlet, useParams } from "metabase/router";
import { Card, Center, Skeleton } from "metabase/ui";
import * as Urls from "metabase/urls";

import { DataStudioPageSkeleton } from "../../../components/DataStudioPageSkeleton";
import { TableHeader } from "../../components/TableHeader";

type TableDependenciesPageParams = {
  tableId: string;
};

export function TableDependenciesPage() {
  const params = useParams<TableDependenciesPageParams>();
  const tableId = Urls.extractEntityId(params.tableId);
  const { table, isLoading, error } = useLoadTableWithMetadata(tableId);

  if (isLoading) {
    return (
      <DataStudioPageSkeleton icon="table" tabCount={5}>
        <Skeleton flex={1} radius="md" />
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
    <PageContainer data-testid="table-dependencies-page">
      <TableHeader table={table} />
      <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
        value={{
          baseUrl: Urls.dataStudioTableDependencies(table.id),
          defaultEntry: { id: table.id, type: "table" },
        }}
      >
        <Card p={0} withBorder flex={1}>
          <Outlet />
        </Card>
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </PageContainer>
  );
}
