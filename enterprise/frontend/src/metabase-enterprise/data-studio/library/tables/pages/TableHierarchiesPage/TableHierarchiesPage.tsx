import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { HierarchyFlatList } from "metabase/data-studio/data-model/pages/DataModel/TableSection/HierarchyList";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { TableHeader } from "../../components/TableHeader";
import { TableListBody } from "../../components/TableListBody";

type TableHierarchiesPageParams = {
  tableId: string;
};

/**
 * PROTOTYPE: a published table's hierarchies, as a list of rows that open
 * each hierarchy's page
 */
export function TableHierarchiesPage() {
  const params = useParams<TableHierarchiesPageParams>();
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
    <PageContainer data-testid="table-hierarchies-page" gap="lg" px={0} pb={0}>
      <TableHeader table={table} px="3.5rem" />
      <TableListBody hasPageBackground>
        <HierarchyFlatList
          table={table}
          getHierarchyHref={(hierarchyId) =>
            Urls.dataStudioTableHierarchy(table.id, hierarchyId)
          }
          newHierarchyHref={Urls.dataStudioTableHierarchyNew(table.id)}
        />
      </TableListBody>
    </PageContainer>
  );
}
