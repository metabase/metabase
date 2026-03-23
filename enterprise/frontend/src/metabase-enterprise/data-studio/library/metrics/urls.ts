import * as Urls from "metabase/lib/urls";
import type { MetricUrls } from "metabase/metrics/types";

export const dataStudioMetricUrls: MetricUrls = {
  overview: Urls.dataStudioMetric,
  query: Urls.dataStudioMetricQuery,
  dependencies: Urls.dataStudioMetricDependencies,
  caching: Urls.dataStudioMetricCaching,
  database: (databaseId) => Urls.dataStudioData({ databaseId }),
};
