import type { MetricPageParams } from "metabase/metrics/types";
import { PLUGIN_CACHING } from "metabase/plugins";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { dataStudioMetricUrls } from "../../urls";

interface DataStudioMetricCachingPageProps {
  params: MetricPageParams;
}

export function DataStudioMetricCachingPage({
  params,
}: DataStudioMetricCachingPageProps) {
  const CachingPage = PLUGIN_CACHING.MetricCachingPage;
  return (
    <CachingPage
      params={params}
      urls={dataStudioMetricUrls}
      showAppSwitcher
      showDataStudioLink={false}
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    />
  );
}
