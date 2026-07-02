import fetchMock from "fetch-mock";

import type {
  ListMetricDimensionsResponse,
  Metric,
  MetricId,
} from "metabase-types/api";

export function setupMetricEndpoint(metric: Metric) {
  fetchMock.get(`path:/api/metric/${metric.id}`, metric);
}

export function setupMetricsEndpoints(metrics: Metric[]) {
  fetchMock.get("path:/api/metric", metrics);
  metrics.forEach((metric) => setupMetricEndpoint(metric));
}

export function setupMetricDimensionsEndpoints(
  metricId: MetricId,
  response: ListMetricDimensionsResponse,
) {
  fetchMock.get(
    `path:/api/metric/${metricId}/dimension`,
    (call) => {
      const query = new URL(call.url).searchParams.get("query")?.toLowerCase();
      const added = query
        ? response.added.filter((dimension) =>
            dimension.display_name.toLowerCase().includes(query),
          )
        : response.added;
      return { added, addable: response.addable };
    },
    { name: `metric-${metricId}-dimensions-list` },
  );
  fetchMock.post(`path:/api/metric/${metricId}/dimension/add`, response.added, {
    name: `metric-${metricId}-dimensions-add`,
  });
  fetchMock.post(
    `path:/api/metric/${metricId}/dimension/remove`,
    response.added,
    { name: `metric-${metricId}-dimensions-remove` },
  );
  fetchMock.post(
    `path:/api/metric/${metricId}/dimension/set-default`,
    response.added,
    { name: `metric-${metricId}-dimensions-set-default` },
  );
  response.added.forEach((dimension) => {
    fetchMock.post(
      `path:/api/metric/${metricId}/dimension/${encodeURIComponent(dimension.id)}`,
      dimension,
      { name: `metric-${metricId}-dimension-${dimension.id}-update` },
    );
  });
}
