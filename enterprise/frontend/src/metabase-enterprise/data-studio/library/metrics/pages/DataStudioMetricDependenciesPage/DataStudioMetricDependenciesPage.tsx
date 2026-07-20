import type { MetricPageParams } from "metabase/common/metrics/types";
import { MetricDependenciesPage } from "metabase/metrics/pages/MetricDependenciesPage";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { dataStudioMetricUrls } from "../../urls";

interface DataStudioMetricDependenciesPageProps {
  params: MetricPageParams;
}

export function DataStudioMetricDependenciesPage({
  params,
}: DataStudioMetricDependenciesPageProps) {
  return (
    <MetricDependenciesPage
      params={params}
      urls={dataStudioMetricUrls}
      showAppSwitcher
      showDataStudioLink={false}
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
