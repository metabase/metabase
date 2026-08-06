import { MetricDimensionsPage } from "metabase/metrics/pages/MetricDimensionsPage";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { useDataStudioMetricUrls } from "../../urls";

export function DataStudioMetricDimensionsPage() {
  const urls = useDataStudioMetricUrls();
  return (
    <MetricDimensionsPage
      urls={urls}
      showAppSwitcher
      showDataStudioLink={false}
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
