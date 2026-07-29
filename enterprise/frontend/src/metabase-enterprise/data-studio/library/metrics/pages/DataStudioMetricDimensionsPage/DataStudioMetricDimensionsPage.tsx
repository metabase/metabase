import { MetricDimensionsPage } from "metabase/metrics/pages/MetricDimensionsPage";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { dataStudioMetricUrls } from "../../urls";

export function DataStudioMetricDimensionsPage() {
  return (
    <MetricDimensionsPage
      urls={dataStudioMetricUrls}
      showAppSwitcher
      showDataStudioLink={false}
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
