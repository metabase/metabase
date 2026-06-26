import type { MetricPageParams } from "metabase/common/metrics/types";
import { MetricDimensionsPage } from "metabase/metrics/pages/MetricDimensionsPage";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { dataStudioMetricUrls } from "../../urls";

interface DataStudioMetricDimensionsPageProps {
  params: MetricPageParams;
}

export function DataStudioMetricDimensionsPage({
  params,
}: DataStudioMetricDimensionsPageProps) {
  return (
    <MetricDimensionsPage
      params={params}
      urls={dataStudioMetricUrls}
      showAppSwitcher
      showDataStudioLink={false}
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
