import { MetricAboutPage } from "metabase/metrics/pages/MetricAboutPage";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { useDataStudioMetricUrls } from "../../urls";

export function DataStudioMetricAboutPage() {
  const urls = useDataStudioMetricUrls();
  return (
    <MetricAboutPage
      urls={urls}
      showAppSwitcher
      showDataStudioLink={false}
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
