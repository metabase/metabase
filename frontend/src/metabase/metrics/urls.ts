import * as Urls from "metabase/lib/urls";

import type { MetricUrls } from "./types";

export const metricUrls: MetricUrls = {
  overview: Urls.metricOverview,
  dimensionGrid: Urls.metricDimensionGrid,
  query: Urls.metricQuery,
  dependencies: Urls.metricDependencies,
  caching: Urls.metricCaching,
  history: Urls.metricHistory,
};
