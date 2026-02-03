import type { ReactNode } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Card, Center } from "metabase/ui";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import { useLoadTableWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-table-with-metadata";

import { TableHeader } from "../../components/TableHeader";

type TableDependenciesPageParams = {
  tableId: string;
};

type TableDependenciesPageProps = {
  params: TableDependenciesPageParams;
  children?: ReactNode;
};

export function TableDependenciesPage({
  params,
  children,
}: TableDependenciesPageProps) {
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
    <PageContainer data-testid="table-dependencies-page">
      <TableHeader table={table} />
      <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
        value={{
          baseUrl: Urls.dataStudioTableDependencies(table.id),
          defaultEntry: { id: table.id, type: "table" },
        }}
      >
        <Card p={0} withBorder flex={1}>
          {children}
        </Card>
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </PageContainer>
  );
}
