import type { MetricDatasetRequest } from "metabase-types/api";

/**
 * Lib generates new internal UUIDs whenever a metric definition is rebuilt.
 * Replace them with positional values so RTK Query does not refetch an otherwise
 * unchanged metric dataset after unrelated metadata updates. Reusing a positional
 * value preserves relationships between source and projection references.
 */
export function getMetricDatasetCacheKey(
  request: MetricDatasetRequest,
): string {
  const canonicalUuids = new Map<string, string>();

  return (
    JSON.stringify(request, (key: string, value: unknown) => {
      if (key !== "lib/uuid" || typeof value !== "string") {
        return value;
      }

      const canonicalUuid = canonicalUuids.get(value);
      if (canonicalUuid) {
        return canonicalUuid;
      }

      const nextUuid = `uuid-${canonicalUuids.size}`;
      canonicalUuids.set(value, nextUuid);
      return nextUuid;
    }) ?? ""
  );
}
