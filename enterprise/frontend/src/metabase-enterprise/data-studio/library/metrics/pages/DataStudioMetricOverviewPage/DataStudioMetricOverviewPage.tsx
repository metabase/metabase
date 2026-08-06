import { MetricOverviewPage } from "metabase/metrics/pages/MetricOverviewPage";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { useDataStudioMetricUrls } from "../../urls";

export function DataStudioMetricOverviewPage() {
  const urls = useDataStudioMetricUrls();
  return (
    <MetricOverviewPage
      urls={urls}
      showAppSwitcher
      showDataStudioLink={false}
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
