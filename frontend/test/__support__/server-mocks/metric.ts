import fetchMock from "fetch-mock";
import { Metric } from "metabase-types/api";

export function setupMetricEndpoint(metric: Metric) {
  fetchMock.get(`path:/api/metric/${metric.id}`, metric);
}

export function setupMetricsEndpoints(metrics: Metric[]) {
  fetchMock.get(`path:/api/metric`, metrics);
  metrics.forEach(metric => setupMetricEndpoint(metric));
}
