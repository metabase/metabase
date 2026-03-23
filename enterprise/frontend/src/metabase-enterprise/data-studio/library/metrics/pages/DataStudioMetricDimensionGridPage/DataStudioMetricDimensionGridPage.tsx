import { MetricDimensionGridPage } from "metabase/metrics/pages/MetricDimensionGridPage";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { dataStudioMetricUrls } from "../../urls";

export function DataStudioMetricDimensionGridPage({
  params,
}: {
  params: { cardId: string };
}) {
  return (
    <MetricDimensionGridPage
      params={params}
      urls={dataStudioMetricUrls}
      showAppSwitcher
      showDataStudioLink={false}
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
