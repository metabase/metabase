import type { Route } from "react-router";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center } from "metabase/ui";

import { PublishedTableMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { usePublishedTableMeasurePage } from "../../hooks";
import { MeasureDetailPage } from "../MeasureDetailPage";

type PublishedTableMeasureDetailPageParams = {
  tableId: string;
  measureId: string;
};

type PublishedTableMeasureDetailPageProps = {
  params: PublishedTableMeasureDetailPageParams;
  route: Route;
};

export function PublishedTableMeasureDetailPage({
  params,
  route,
}: PublishedTableMeasureDetailPageProps) {
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
    <MeasureDetailPage
      route={route}
      measure={measure}
      tabUrls={tabUrls}
      breadcrumbs={
        <PublishedTableMeasureBreadcrumbs table={table} measure={measure} />
      }
      onRemove={onRemove}
    />
  );
}
