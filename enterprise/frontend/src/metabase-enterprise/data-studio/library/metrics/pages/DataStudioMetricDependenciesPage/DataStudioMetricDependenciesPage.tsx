import { MetricDependenciesPage } from "metabase/metrics/pages/MetricDependenciesPage";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { useDataStudioMetricUrls } from "../../urls";

export function DataStudioMetricDependenciesPage() {
  const urls = useDataStudioMetricUrls();
  return (
    <MetricDependenciesPage
      urls={urls}
      showAppSwitcher
      showDataStudioLink={false}
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
