import { MetricHistoryPage } from "metabase/metrics/pages/MetricHistoryPage";
import type { MetricPageParams } from "metabase/metrics/types";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { dataStudioMetricUrls } from "../../urls";

interface DataStudioMetricHistoryPageProps {
  params: MetricPageParams;
}

export function DataStudioMetricHistoryPage({
  params,
}: DataStudioMetricHistoryPageProps) {
  return (
    <MetricHistoryPage
      params={params}
      urls={dataStudioMetricUrls}
      showAppSwitcher
      showDataStudioLink={false}
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
