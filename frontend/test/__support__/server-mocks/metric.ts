import fetchMock from "fetch-mock";

import type {
  Dataset,
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

export function setupMetricDatasetEndpoint(dataset: Dataset) {
  fetchMock.post("path:/api/metric/dataset", dataset, {
    name: "metric-dataset",
  });
}

export function setupMetricDimensionsEndpoints(
  metricId: MetricId,
  response: ListMetricDimensionsResponse,
) {
  // Reorder mutates this so subsequent GETs reflect the persisted order.
  let added = [...response.added];

  fetchMock.get(
    `path:/api/metric/${metricId}/dimension`,
    (call) => {
      const query = new URL(call.url).searchParams.get("query")?.toLowerCase();
      const filtered = query
        ? added.filter((dimension) =>
            dimension.display_name.toLowerCase().includes(query),
          )
        : added;
      return { added: filtered, addable: response.addable };
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
    `path:/api/metric/${metricId}/dimension/reorder`,
    async (call) => {
      const body = JSON.parse((await call.request?.text()) ?? "{}");
      const position = new Map<string, number>(
        (body.dimension_ids ?? []).map((id: string, index: number) => [
          id,
          index,
        ]),
      );
      added = [...added].sort(
        (a, b) =>
          (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity),
      );
      return added;
    },
    { name: `metric-${metricId}-dimensions-reorder` },
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
