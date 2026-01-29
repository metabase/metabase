import type { ReactNode } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadTableWithMetadata } from "metabase/data-studio/common/hooks/use-load-table-with-metadata";
import * as Urls from "metabase/lib/urls";
import { Center } from "metabase/ui";

import { PublishedTableMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { NewMeasurePage } from "../NewMeasurePage";

type PublishedTableNewMeasurePageParams = {
  tableId: string;
};

type PublishedTableNewMeasurePageProps = {
  params: PublishedTableNewMeasurePageParams;
  children?: ReactNode;
};

export function PublishedTableNewMeasurePage({
  params,
}: PublishedTableNewMeasurePageProps) {
  const tableId = Urls.extractEntityId(params.tableId);

  const { table, isLoading, error } = useLoadTableWithMetadata(tableId, {
    includeForeignTables: true,
  });

  if (isLoading || error || !table || tableId == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <NewMeasurePage
      table={table}
      breadcrumbs={<PublishedTableMeasureBreadcrumbs table={table} />}
      getSuccessUrl={(measure) =>
        Urls.dataStudioPublishedTableMeasure(tableId, measure.id)
      }
    />
  );
}
