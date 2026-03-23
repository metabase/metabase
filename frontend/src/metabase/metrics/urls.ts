import * as Urls from "metabase/lib/urls";

import type { MetricUrls } from "./types";

export const metricUrls: MetricUrls = {
  overview: Urls.metricOverview,
  query: Urls.metricQuery,
  dependencies: Urls.metricDependencies,
  caching: Urls.metricCaching,
};
