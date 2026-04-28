import { MetricOverviewPage } from "metabase/metrics/pages/MetricOverviewPage";
import type { MetricPageParams } from "metabase/metrics/types";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { dataStudioMetricUrls } from "../../urls";

interface DataStudioMetricOverviewPageProps {
  params: MetricPageParams;
}

export function DataStudioMetricOverviewPage({
  params,
}: DataStudioMetricOverviewPageProps) {
  return (
    <MetricOverviewPage
      params={params}
      urls={dataStudioMetricUrls}
      showAppSwitcher
      showDataStudioLink={false}
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
