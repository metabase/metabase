import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Outlet } from "metabase/router";
import { Center } from "metabase/ui";

import { PublishedTableMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { usePublishedTableMeasurePage } from "../../hooks";
import { MeasureDependenciesPage } from "../MeasureDependenciesPage";

type PublishedTableMeasureDependenciesPageParams = {
  tableId: string;
  measureId: string;
};

type PublishedTableMeasureDependenciesPageProps = {
  params: PublishedTableMeasureDependenciesPageParams;
};

export function PublishedTableMeasureDependenciesPage({
  params,
}: PublishedTableMeasureDependenciesPageProps) {
  const { isLoading, error, measure, table, tabUrls, onRemove } =
    usePublishedTableMeasurePage(params);

  if (isLoading || error || !measure || !table || !tabUrls) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <MeasureDependenciesPage
      measure={measure}
      tabUrls={tabUrls}
      breadcrumbs={
        <PublishedTableMeasureBreadcrumbs table={table} measure={measure} />
      }
      onRemove={onRemove}
    >
      <Outlet />
    </MeasureDependenciesPage>
  );
}
