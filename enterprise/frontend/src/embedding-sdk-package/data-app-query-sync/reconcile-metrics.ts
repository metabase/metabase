import { getPayloadFingerprint } from "./canonical";
import { isPositiveInteger, isRecord } from "./guards";
import { writeResourceLockfile } from "./lockfile";
import type { MetabaseClient } from "./metabase-client";
import { orNullOn404 } from "./metabase-client";
import type { DataAppMetric, ResourceLockfile } from "./types";

interface ResolvedQuery {
  dataset_query: Record<string, unknown>;
  metrics: DataAppMetric[];
}

const metricInput = (metric: DataAppMetric, collectionId: number) => ({
  name: metric.name,
  collectionId,
  datasetQuery: metric.dataset_query,
  display: metric.display ?? "table",
  visualizationSettings: metric.visualization_settings ?? {},
  description: metric.description ?? null,
});

type MetricClause = readonly [
  type: "metric",
  options: unknown,
  metricId: number,
  ...rest: unknown[],
];

// A MBQL metric clause has the form ["metric", options, metricId].
const METRIC_ID_INDEX = 2;

const isMetricCard = (value: { type: string }): value is DataAppMetric =>
  value.type === "metric";

const isMetricClause = (clause: unknown): clause is MetricClause =>
  Array.isArray(clause) &&
  clause[0] === "metric" &&
  typeof clause[METRIC_ID_INDEX] === "number";

function getMetricClauseIds(
  clause: unknown,
  ids = new Set<number>(),
): Set<number> {
  if (Array.isArray(clause)) {
    if (isMetricClause(clause)) {
      ids.add(clause[METRIC_ID_INDEX]);

      return ids;
    }

    clause.forEach((item) => getMetricClauseIds(item, ids));
  } else if (isRecord(clause)) {
    Object.values(clause).forEach((item) => getMetricClauseIds(item, ids));
  }

  return ids;
}

function getSavedCardSourceIds(
  query: unknown,
  ids = new Set<number>(),
): Set<number> {
  if (Array.isArray(query)) {
    query.forEach((item) => getSavedCardSourceIds(item, ids));
  } else if (isRecord(query)) {
    Object.entries(query).forEach(([key, value]) => {
      if (key === "source-card" && isPositiveInteger(value)) {
        ids.add(value);
      } else if (key === "source-table" && typeof value === "string") {
        const match = /^card__(\d+)$/.exec(value);
        const id = match && Number(match[1]);

        if (isPositiveInteger(id)) {
          ids.add(id);
        }
      }

      getSavedCardSourceIds(value, ids);
    });
  }

  return ids;
}

/**
 * Rewrite a metric clause to
 * swap the original metric id with the copied metric id.
 */
function rewriteMetricClause(
  [type, options, metricId, ...rest]: MetricClause,
  copiedMetricIdBySourceMetricId: Map<number, number>,
): MetricClause {
  const copiedMetricId = copiedMetricIdBySourceMetricId.get(metricId);

  if (copiedMetricId === undefined) {
    throw new Error(`Missing copied metric for metric ${metricId}.`);
  }

  return [type, options, copiedMetricId, ...rest];
}

function rewriteMetricClauses(
  clause: unknown,
  copiedMetricIdBySourceMetricId: Map<number, number>,
): unknown {
  if (Array.isArray(clause)) {
    if (isMetricClause(clause)) {
      return rewriteMetricClause(clause, copiedMetricIdBySourceMetricId);
    }

    return clause.map((item) =>
      rewriteMetricClauses(item, copiedMetricIdBySourceMetricId),
    );
  }

  if (clause === null || typeof clause !== "object") {
    return clause;
  }

  return Object.fromEntries(
    Object.entries(clause).map(([key, item]) => [
      key,
      rewriteMetricClauses(item, copiedMetricIdBySourceMetricId),
    ]),
  );
}

function removeMetricLockEntry(
  appRoot: string,
  lockfile: ResourceLockfile,
  sourceMetricId: number,
) {
  const index = lockfile.metrics.findIndex(
    (entry) => entry.sourceMetricId === sourceMetricId,
  );

  if (index >= 0) {
    lockfile.metrics.splice(index, 1);
    writeResourceLockfile(appRoot, lockfile);
  }
}

type ReconcilerContext = {
  appRoot: string;
  collectionId: number;
  lockfile: ResourceLockfile;
  log: (message: string) => void;
};

export async function reconcileRemovedMetrics({
  appRoot,
  collectionId,
  previousEntries,
  liveMetricIds,
  lockfile,
  client,
  log,
}: ReconcilerContext & {
  liveMetricIds: Set<number>;
  previousEntries: ResourceLockfile["metrics"];

  client: Pick<MetabaseClient, "getCard" | "deleteCard">;
}) {
  for (const entry of previousEntries) {
    if (liveMetricIds.has(entry.sourceMetricId)) {
      continue;
    }

    const copiedMetric = await orNullOn404(
      client.getCard(entry.copiedMetricId),
    );

    if (copiedMetric) {
      if (
        !isMetricCard(copiedMetric) ||
        copiedMetric.collection_id !== collectionId
      ) {
        throw new Error(
          `Metric ${copiedMetric.id} is no longer in data app collection ${collectionId}. Move it back, then run sync-resources again.`,
        );
      }

      await client.deleteCard(copiedMetric.id);

      log(`deleted metric: ${copiedMetric.id}`);
    }

    removeMetricLockEntry(appRoot, lockfile, entry.sourceMetricId);
  }
}

export async function reconcileMetrics({
  appRoot,
  collectionId,
  resolvedQueries,
  lockfile,
  client,
  log,
}: ReconcilerContext & {
  resolvedQueries: ResolvedQuery[];

  client: Pick<
    MetabaseClient,
    "getCard" | "createMetric" | "updateMetric" | "deleteCard"
  >;
}) {
  const previousEntries = [...lockfile.metrics];

  const metrics = [
    ...new Map(
      resolvedQueries.flatMap(({ metrics }) =>
        metrics.map((metric) => [metric.id, metric]),
      ),
    ).values(),
  ];

  const liveMetricIds = new Set(metrics.map((metric) => metric.id));

  const missingMetricIds = [
    ...new Set(
      resolvedQueries.flatMap(({ dataset_query }) => [
        ...getMetricClauseIds(dataset_query),
      ]),
    ),
  ]
    .filter((metricId) => !liveMetricIds.has(metricId))
    .sort((a, b) => a - b);

  if (missingMetricIds.length > 0) {
    throw new Error(
      `These metrics are missing and cannot be reconciled: ${missingMetricIds.join(", ")}.`,
    );
  }

  const metricsWithSavedCardSources = metrics
    .filter((metric) => getSavedCardSourceIds(metric.dataset_query).size > 0)
    .map((metric) => metric.id)
    .sort((a, b) => a - b);

  if (metricsWithSavedCardSources.length > 0) {
    throw new Error(
      `Metrics with saved-card joins cannot be synchronized: ${metricsWithSavedCardSources.join(", ")}.`,
    );
  }

  const copiedMetricIdBySourceMetricId = new Map<number, number>();

  for (const metric of metrics) {
    const input = metricInput(metric, collectionId);
    const hash = getPayloadFingerprint(input);

    const entry = lockfile.metrics.find(
      ({ sourceMetricId }) => sourceMetricId === metric.id,
    );

    const copiedMetric = entry
      ? await orNullOn404(client.getCard(entry.copiedMetricId))
      : null;

    if (copiedMetric) {
      if (
        !isMetricCard(copiedMetric) ||
        copiedMetric.collection_id !== collectionId
      ) {
        throw new Error(
          `Metric ${copiedMetric.id} is not managed by data app collection ${collectionId}.`,
        );
      }

      const changed =
        getPayloadFingerprint(metricInput(copiedMetric, collectionId)) !== hash;

      if (changed) {
        await client.updateMetric(copiedMetric.id, input);
      }

      copiedMetricIdBySourceMetricId.set(metric.id, copiedMetric.id);

      if (entry) {
        entry.hash = hash;
      }

      log(
        `${changed ? "updated" : "unchanged"} metric: ${metric.id} -> ${copiedMetric.id}`,
      );
    } else {
      const created = await client.createMetric(input);

      if (!isPositiveInteger(created.id)) {
        throw new Error("The copied metric does not have a valid ID.");
      }

      copiedMetricIdBySourceMetricId.set(metric.id, created.id);

      if (entry) {
        Object.assign(entry, { copiedMetricId: created.id, hash });
      } else {
        lockfile.metrics.push({
          hash,
          sourceMetricId: metric.id,
          copiedMetricId: created.id,
        });
      }

      log(`copied metric: ${metric.id} -> ${created.id}`);
    }

    writeResourceLockfile(appRoot, lockfile);
  }

  for (const resolved of resolvedQueries) {
    const rewrittenMetricQuery = rewriteMetricClauses(
      resolved.dataset_query,
      copiedMetricIdBySourceMetricId,
    );

    if (!isRecord(rewrittenMetricQuery)) {
      throw new Error("Rewritten metric query must be an object.");
    }

    resolved.dataset_query = rewrittenMetricQuery;
  }

  return { previousEntries, liveMetricIds };
}
