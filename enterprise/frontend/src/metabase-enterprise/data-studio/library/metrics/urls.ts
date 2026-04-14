import type { MetricUrls } from "metabase/metrics/types";
import * as Urls from "metabase/utils/urls";

export const dataStudioMetricUrls: MetricUrls = {
  about: Urls.dataStudioMetric,
  overview: Urls.dataStudioMetricOverview,
  query: Urls.dataStudioMetricQuery,
  dependencies: Urls.dataStudioMetricDependencies,
  caching: Urls.dataStudioMetricCaching,
  history: Urls.dataStudioMetricHistory,
  database: (databaseId) => Urls.dataStudioData({ databaseId }),
};
