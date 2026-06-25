import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

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
