import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { EntityDetailPageSkeleton } from "metabase/data-studio/common/components/EntityDetailPageSkeleton";
import { Outlet, useParams } from "metabase/router";
import { Center } from "metabase/ui";

import { PublishedTableMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { usePublishedTableMeasurePage } from "../../hooks/use-published-table-measure-page";
import { MeasureDependenciesPage } from "../MeasureDependenciesPage";

type PublishedTableMeasureDependenciesPageParams = {
  tableId: string;
  measureId: string;
};

export function PublishedTableMeasureDependenciesPage() {
  const params = useParams<PublishedTableMeasureDependenciesPageParams>();
  const { isLoading, error, measure, table, tabUrls, onRemove } =
    usePublishedTableMeasurePage(params);

  if (isLoading) {
    return <EntityDetailPageSkeleton page="dependencies" />;
  }

  if (error || !measure || !table || !tabUrls) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={error} />
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
