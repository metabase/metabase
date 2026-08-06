import { MetricHistoryPage } from "metabase/metrics/pages/MetricHistoryPage";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { useDataStudioMetricUrls } from "../../urls";

export function DataStudioMetricHistoryPage() {
  const urls = useDataStudioMetricUrls();
  return (
    <MetricHistoryPage
      urls={urls}
      showAppSwitcher
      showDataStudioLink={false}
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
