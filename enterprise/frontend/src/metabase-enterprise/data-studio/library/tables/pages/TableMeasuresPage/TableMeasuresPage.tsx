import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { useLoadTableWithMetadata } from "metabase/data-studio/common/hooks/use-load-table-with-metadata";
import * as Urls from "metabase/lib/urls";
import { Center } from "metabase/ui";

import { TableHeader } from "../../components/TableHeader";

import { TableMeasures } from "./TableMeasures";

type TableMeasuresPageParams = {
  tableId: string;
};

type TableMeasuresPageProps = {
  params: TableMeasuresPageParams;
};

export function TableMeasuresPage({ params }: TableMeasuresPageProps) {
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
    <PageContainer data-testid="table-measures-page">
      <TableHeader table={table} />
      <TableMeasures table={table} />
    </PageContainer>
  );
}
