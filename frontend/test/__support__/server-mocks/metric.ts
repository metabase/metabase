import fetchMock from "fetch-mock";

import type { Metric } from "metabase-types/api";
import { createMockMetric } from "metabase-types/api/mocks";

export function setupMetricEndpoint(metric: Metric) {
  fetchMock.get(`path:/api/legacy-metric/${metric.id}`, metric);
}

export function setupMetricsEndpoints(metrics: Metric[]) {
  fetchMock.post("path:/api/legacy-metric", async url => {
    const metric = await fetchMock.lastCall(url)?.request?.json();
    return createMockMetric(metric);
  });
  fetchMock.get("path:/api/legacy-metric", metrics);
  metrics.forEach(metric => setupMetricEndpoint(metric));
}
