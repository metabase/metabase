import type { MetricUrls } from "metabase/common/metrics/types";
import * as Urls from "metabase/urls";

export const dataStudioMetricUrls: MetricUrls = {
  about: Urls.dataStudioMetric,
  overview: Urls.dataStudioMetricOverview,
  query: Urls.dataStudioMetricQuery,
  dependencies: Urls.dataStudioMetricDependencies,
  history: Urls.dataStudioMetricHistory,
  database: (databaseId) => Urls.dataStudioData({ databaseId }),
  table: (_databaseId, tableId) => Urls.dataStudioTable(tableId),
};
