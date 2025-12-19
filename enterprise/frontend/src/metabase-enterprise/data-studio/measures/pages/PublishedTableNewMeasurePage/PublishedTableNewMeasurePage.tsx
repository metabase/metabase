import type { ReactNode } from "react";
import type { Route } from "react-router";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center } from "metabase/ui";
import { useLoadTableWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-table-with-metadata";

import { PublishedTableMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { NewMeasurePage } from "../NewMeasurePage";

type PublishedTableNewMeasurePageParams = {
  tableId: string;
};

type PublishedTableNewMeasurePageProps = {
  params: PublishedTableNewMeasurePageParams;
  route: Route;
  children?: ReactNode;
};

export function PublishedTableNewMeasurePage({
  params,
  route,
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
      route={route}
      table={table}
      breadcrumbs={<PublishedTableMeasureBreadcrumbs table={table} />}
      getSuccessUrl={(measure) =>
        Urls.dataStudioPublishedTableMeasure(tableId, measure.id)
      }
    />
  );
}
