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
  // Mutations update this so subsequent GETs reflect persisted dimensions.
  let added = [...response.added];

  fetchMock.get(
    `path:/api/metric/${metricId}/dimension`,
    (call) => {
      const searchParams = new URL(call.url).searchParams;
      const query = searchParams.get("query")?.toLowerCase();
      const includeOrphaned = searchParams.get("include-orphaned") === "true";
      const visibleAdded = includeOrphaned
        ? added
        : added.filter(({ status }) => status !== "status/orphaned");
      const filteredAdded = query
        ? visibleAdded.filter((dimension) =>
            dimension.display_name.toLowerCase().includes(query),
          )
        : visibleAdded;
      const addable =
        searchParams.get("with-addable") === "true"
          ? response.addable
              .map(({ group, dimensions }) => ({
                group,
                dimensions: query
                  ? dimensions.filter((dimension) =>
                      dimension.display_name.toLowerCase().includes(query),
                    )
                  : dimensions,
              }))
              .filter(({ dimensions }) => dimensions.length > 0)
          : [];
      return { added: filteredAdded, addable };
    },
    { name: `metric-${metricId}-dimensions-list` },
  );
  fetchMock.post(`path:/api/metric/${metricId}/dimension/add`, response.added, {
    name: `metric-${metricId}-dimensions-add`,
  });
  fetchMock.post(
    `path:/api/metric/${metricId}/dimension/remove`,
    async (call) => {
      const body: { dimension_ids?: string[] } = JSON.parse(
        (await call.request?.text()) ?? "{}",
      );
      const removedIds = new Set(body.dimension_ids ?? []);
      added = added.filter((dimension) => !removedIds.has(dimension.id));
      return added;
    },
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
