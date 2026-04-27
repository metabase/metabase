import fetchMock from "fetch-mock";

import type { Metric } from "metabase-types/api";

export function setupMetricEndpoint(metric: Metric) {
  fetchMock.get(`path:/api/metric/${metric.id}`, metric);
}

export function setupMetricsEndpoints(metrics: Metric[]) {
  fetchMock.get("path:/api/metric", {
    data: metrics,
    total: metrics.length,
    limit: null,
    offset: null,
  });
  metrics.forEach((metric) => setupMetricEndpoint(metric));
}
