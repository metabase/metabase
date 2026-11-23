import fetchMock from "fetch-mock";

import type {
  AddMetricDimensionsRequest,
  Dataset,
  ExplorationDimensionGroup,
  ListMetricDimensionsResponse,
  Metric,
  MetricDimension,
  MetricId,
} from "metabase-types/api";

type AddMetricDimensionsBody = Partial<
  Omit<AddMetricDimensionsRequest, "metricId">
>;

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
        metrics: filtered,
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
  let addable = [...response.addable];

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
      const filteredAddable =
        searchParams.get("with-addable") === "true"
          ? addable
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
      return { added: filteredAdded, addable: filteredAddable };
    },
    { name: `metric-${metricId}-dimensions-list` },
  );
  fetchMock.post(
    `path:/api/metric/${metricId}/dimension/add`,
    async (call) => {
      const body: AddMetricDimensionsBody = JSON.parse(
        (await call.request?.text()) ?? "{}",
      );
      const addedIds = new Set(
        (body.dimensions ?? []).map((dimension) => dimension.id),
      );
      const newDimensions = (body.dimensions ?? []).map(
        ({ mapping_target: _mappingTarget, ...dimension }) => ({
          ...dimension,
          status: "status/active" as const,
          default: false,
        }),
      );
      added = [...added, ...newDimensions];
      addable = addable.map(({ group, dimensions }) => ({
        group,
        dimensions: dimensions.filter(
          (dimension) => !addedIds.has(dimension.id),
        ),
      }));
      newDimensions.forEach((dimension) => setupUpdateRoute(dimension.id));
      return added;
    },
    { name: `metric-${metricId}-dimensions-add` },
  );
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
    async (call) => {
      const body: { dimension_id?: string | null } = JSON.parse(
        (await call.request?.text()) ?? "{}",
      );
      added = added.map((dimension) => ({
        ...dimension,
        default: dimension.id === body.dimension_id,
      }));
      return added;
    },
    { name: `metric-${metricId}-dimensions-set-default` },
  );

  function setupUpdateRoute(dimensionId: string) {
    fetchMock.post(
      `path:/api/metric/${metricId}/dimension/${encodeURIComponent(dimensionId)}`,
      async (call) => {
        const changes: Partial<MetricDimension> = JSON.parse(
          (await call.request?.text()) ?? "{}",
        );
        added = added.map((dimension) =>
          dimension.id === dimensionId
            ? { ...dimension, ...changes }
            : dimension,
        );
        return added.find((dimension) => dimension.id === dimensionId);
      },
      { name: `metric-${metricId}-dimension-${dimensionId}-update` },
    );
  }

  response.added.forEach((dimension) => setupUpdateRoute(dimension.id));
}
