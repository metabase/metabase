import * as Urls from "metabase/utils/urls";

import type { MetricUrls } from "./types";

export const metricUrls: MetricUrls = {
  about: Urls.metricAbout,
  overview: Urls.metricOverview,
  query: Urls.metricQuery,
  dependencies: Urls.metricDependencies,
  caching: Urls.metricCaching,
  history: Urls.metricHistory,
};
