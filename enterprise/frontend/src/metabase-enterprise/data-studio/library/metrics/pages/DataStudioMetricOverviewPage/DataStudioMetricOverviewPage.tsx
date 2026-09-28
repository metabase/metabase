import { MetricOverviewPage } from "metabase/metrics/pages/MetricOverviewPage";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { dataStudioMetricUrls } from "../../urls";

export function DataStudioMetricOverviewPage() {
  return (
    <MetricOverviewPage
      urls={dataStudioMetricUrls}
      showAppSwitcher
      showDataStudioLink={false}
      isInlineEditable
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
