import { MetricDependenciesPage } from "metabase/metrics/pages/MetricDependenciesPage";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { dataStudioMetricUrls } from "../../urls";

export function DataStudioMetricDependenciesPage() {
  return (
    <MetricDependenciesPage
      urls={dataStudioMetricUrls}
      showAppSwitcher
      showDataStudioLink={false}
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
