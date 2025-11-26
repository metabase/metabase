import type { ReactNode } from "react";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Center, Flex } from "metabase/ui";

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
    <Flex direction="column" h="100%">
      <TableHeader table={table} />
      <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
        value={{
          baseUrl: Urls.dataStudioTableDependencies(table.id),
          defaultEntry: { id: table.id, type: "table" },
        }}
      >
        {children}
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </Flex>
  );
}
