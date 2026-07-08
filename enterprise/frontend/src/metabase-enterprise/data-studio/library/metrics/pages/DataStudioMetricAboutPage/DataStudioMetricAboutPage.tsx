import type { MetricPageParams } from "metabase/common/metrics/types";
import { MetricAboutPage } from "metabase/metrics/pages/MetricAboutPage";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { dataStudioMetricUrls } from "../../urls";

interface DataStudioMetricAboutPageProps {
  params: MetricPageParams;
}

export function DataStudioMetricAboutPage({
  params,
}: DataStudioMetricAboutPageProps) {
  return (
    <MetricAboutPage
      params={params}
      urls={dataStudioMetricUrls}
      showAppSwitcher
      showDataStudioLink={false}
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
