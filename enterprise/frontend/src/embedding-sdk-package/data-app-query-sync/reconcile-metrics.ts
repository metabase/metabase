import { getPayloadFingerprint } from "./canonical";
import { isPositiveInteger, isRecord } from "./guards";
import { writeResourceLockfile } from "./lockfile";
import type { MetabaseClient } from "./metabase-client";
import { orNullOn404 } from "./metabase-client";
import type { DataAppMetricCard, ResourceLockfile } from "./types";

interface ResolvedQuery {
  dataset_query: Record<string, unknown>;
  metrics: DataAppMetricCard[];
}

const isMetricCard = (card: { type: string }): card is DataAppMetricCard =>
  card.type === "metric";

const metricInput = (metric: DataAppMetricCard, collectionId: number) => ({
  name: metric.name,
  collectionId,
  datasetQuery: metric.dataset_query,
  display: metric.display ?? "table",
  visualizationSettings: metric.visualization_settings ?? {},
  description: metric.description ?? null,
});

function rewriteMetricReferences(
  value: unknown,
  copiedMetricIdBySourceMetricId: Record<number, number>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      index === 2 && value[0] === "metric" && typeof item === "number"
        ? (copiedMetricIdBySourceMetricId[item] ?? item)
        : rewriteMetricReferences(item, copiedMetricIdBySourceMetricId),
    );
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      rewriteMetricReferences(item, copiedMetricIdBySourceMetricId),
    ]),
  );
}

export async function reconcileMetrics({
  appRoot,
  collectionId,
  resolvedQueries,
  lockfile,
  client,
  log,
}: {
  appRoot: string;
  collectionId: number;
  resolvedQueries: ResolvedQuery[];
  lockfile: ResourceLockfile;
  client: Pick<MetabaseClient, "getCard" | "createMetric" | "updateMetric">;
  log: (message: string) => void;
}) {
  const metrics = [
    ...new Map(
      resolvedQueries.flatMap(({ metrics }) =>
        metrics.map((metric) => [metric.id, metric]),
      ),
    ).values(),
  ];

  const copiedMetricIdBySourceMetricId: Record<number, number> = {};

  for (const metric of metrics) {
    const input = metricInput(metric, collectionId);
    const hash = getPayloadFingerprint(input);

    const entry = lockfile.metrics.find(
      ({ sourceMetricId }) => sourceMetricId === metric.id,
    );

    const copiedCard = entry
      ? await orNullOn404(client.getCard(entry.copiedMetricId))
      : null;

    if (copiedCard) {
      if (
        !isMetricCard(copiedCard) ||
        copiedCard.collection_id !== collectionId
      ) {
        throw new Error(
          `Metric copy Card ${copiedCard.id} is no longer an owned metric in data app collection ${collectionId}.`,
        );
      }

      const changed =
        getPayloadFingerprint(metricInput(copiedCard, collectionId)) !== hash;

      if (changed) {
        await client.updateMetric(copiedCard.id, input);
      }

      copiedMetricIdBySourceMetricId[metric.id] = copiedCard.id;

      if (entry) {
        entry.hash = hash;
      }

      log(
        `${changed ? "updated" : "unchanged"} metric: card ${metric.id} -> card ${copiedCard.id}`,
      );
    } else {
      const created = await client.createMetric(input);

      if (!isPositiveInteger(created.id)) {
        throw new Error("The Card API did not return a valid metric copy ID.");
      }

      copiedMetricIdBySourceMetricId[metric.id] = created.id;

      if (entry) {
        Object.assign(entry, { copiedMetricId: created.id, hash });
      } else {
        lockfile.metrics.push({
          sourceMetricId: metric.id,
          copiedMetricId: created.id,
          hash,
        });
      }

      log(`copied metric: card ${metric.id} -> card ${created.id}`);
    }

    writeResourceLockfile(appRoot, lockfile);
  }

  for (const resolved of resolvedQueries) {
    const rewritten = rewriteMetricReferences(
      resolved.dataset_query,
      copiedMetricIdBySourceMetricId,
    );

    if (!isRecord(rewritten)) {
      throw new Error("Rewritten metric query must be an object.");
    }

    resolved.dataset_query = rewritten;
  }
}
