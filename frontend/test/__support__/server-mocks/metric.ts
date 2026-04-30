import fetchMock from "fetch-mock";

import type {
  ExplorationMetric,
  Metric,
  MetricDimension,
} from "metabase-types/api";

export function setupMetricEndpoint(metric: Metric) {
  fetchMock.get(`path:/api/metric/${metric.id}`, metric);
}

function dedupeDimensions(metrics: Metric[]): MetricDimension[] {
  const seen = new Set<string>();
  const out: MetricDimension[] = [];
  for (const m of metrics) {
    for (const d of m.dimensions ?? []) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        out.push(d);
      }
    }
  }
  return out;
}

function toExplorationMetric(metric: Metric): ExplorationMetric {
  const { dimensions: _dimensions, ...rest } = metric;
  return {
    ...rest,
    dimension_ids: (metric.dimensions ?? []).map((d) => d.id),
  };
}

export function setupExplorationDataEndpoint(metrics: Metric[]) {
  fetchMock.get({
    url: "path:/api/exploration/dimensions",
    response: (call) => {
      const q = new URL(call.url).searchParams.get("q") ?? "";
      const query = q.trim().toLowerCase();
      const filtered = !query
        ? metrics
        : metrics.filter(
            (m) =>
              m.name.toLowerCase().includes(query) ||
              (m.dimensions ?? []).some((d) =>
                d.display_name.toLowerCase().includes(query),
              ),
          );
      return {
        metrics: filtered.map(toExplorationMetric),
        dimensions: dedupeDimensions(filtered),
      };
    },
  });
}

export function setupMetricsEndpoints(metrics: Metric[]) {
  fetchMock.get("path:/api/metric", {
    data: metrics,
    total: metrics.length,
    limit: null,
    offset: null,
  });
  metrics.forEach((metric) => setupMetricEndpoint(metric));
  setupExplorationDataEndpoint(metrics);
}
