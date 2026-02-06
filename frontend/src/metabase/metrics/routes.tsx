import { Route } from "react-router";

import { MetricPlaygroundPage } from "metabase/metrics/pages/MetricPlaygroundPage";

export const getMetricRoutes = () => (
  <Route path="metric-playground" component={MetricPlaygroundPage} />
);
