import fetchMock from "fetch-mock";

import type {
  ExplorationDimensionGroup,
  ExplorationMetric,
  Metric,
  MetricDimension,
} from "metabase-types/api";

export function setupMetricEndpoint(metric: Metric) {
  fetchMock.get(`path:/api/metric/${metric.id}`, metric);
}

function sourcesKey(d: MetricDimension): string {
  return JSON.stringify(
    (d.sources ?? []).map((s) => [s.type, s["field-id"]]).sort(),
  );
}

function groupDimensions(metrics: Metric[]): ExplorationDimensionGroup[] {
  const buckets = new Map<string, MetricDimension[]>();
  for (const m of metrics) {
    for (const d of m.dimensions ?? []) {
      const key = sourcesKey(d);
      const list = buckets.get(key);
      if (list) {
        if (!list.some((x) => x.id === d.id)) {
          list.push(d);
        }
      } else {
        buckets.set(key, [d]);
      }
    }
  }
  const groups: ExplorationDimensionGroup[] = [];
  for (const dims of buckets.values()) {
    const head = dims[0];
    const groupName = head.group?.display_name
      ? `${head.group.display_name} - ${head.display_name}`
      : head.display_name;
    const scores = dims
      .map((d) => d.dimension_interestingness)
      .filter((s): s is number => s != null);
    groups.push({
      name: groupName,
      dimension_interestingness: scores.length ? Math.max(...scores) : null,
      dimensions: dims,
    });
  }
  return groups.sort((a, b) => {
    const av = a.dimension_interestingness ?? -Infinity;
    const bv = b.dimension_interestingness ?? -Infinity;
    return bv - av;
  });
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
        dimension_groups: groupDimensions(filtered),
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
