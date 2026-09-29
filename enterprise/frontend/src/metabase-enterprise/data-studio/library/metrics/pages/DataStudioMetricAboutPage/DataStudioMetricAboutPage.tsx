import { MetricAboutPage } from "metabase/metrics/pages/MetricAboutPage";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { dataStudioMetricUrls } from "../../urls";

export function DataStudioMetricAboutPage() {
  return (
    <MetricAboutPage
      urls={dataStudioMetricUrls}
      showAppSwitcher
      showDataStudioLink={false}
      isInlineEditable
      showManagementPanels
      titleSize="h3"
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
