import type { MetricPageParams } from "metabase/common/metrics/types";
import { MetricHistoryPage } from "metabase/metrics/pages/MetricHistoryPage";

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
