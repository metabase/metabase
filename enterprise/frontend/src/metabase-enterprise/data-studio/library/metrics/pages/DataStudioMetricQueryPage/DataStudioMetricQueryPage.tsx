import type { Route } from "react-router";

import { MetricQueryPage } from "metabase/metrics/pages/MetricQueryPage";
import type { MetricPageParams } from "metabase/metrics/types";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { dataStudioMetricUrls } from "../../urls";

interface DataStudioMetricQueryPageProps {
  params: MetricPageParams;
  route: Route;
}

export function DataStudioMetricQueryPage({
  params,
  route,
}: DataStudioMetricQueryPageProps) {
  return (
    <MetricQueryPage
      params={params}
      route={route}
      urls={dataStudioMetricUrls}
      showAppSwitcher
      showDataStudioLink={false}
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
