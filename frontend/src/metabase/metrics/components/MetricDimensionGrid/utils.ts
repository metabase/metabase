import { getDimensionDescriptors } from "metabase/metrics/common/utils/dimension-descriptors";
import type { DimensionType } from "metabase/metrics/common/utils/dimension-types";
import type { MetricDefinition } from "metabase-lib/metric";
import type { DimensionId } from "metabase-types/api/measure";

export interface DefaultDimension {
  dimensionId: string;
  dimensionType: DimensionType;
  label: string;
}

/**
 * Build the dimension list shown on the metric overview page. Descriptors come from the
 * lib-metric `definition` (which is rebuilt from local metadata and follows the underlying
 * query's column order). When `scores` is provided — populated from the API response's
 * `dimension_interestingness` field — the descriptors are sorted by score descending,
 * with nulls last and ties broken by the original descriptor order.
 */
export function getDefaultDimensions(
  definition: MetricDefinition,
  scores?: Map<DimensionId, number | null>,
): DefaultDimension[] {
  const descriptors = [...getDimensionDescriptors(definition).values()];
  const ordered = scores
    ? descriptors
        .map((d, i) => ({ d, i, score: scores.get(d.id) ?? null }))
        .sort((a, b) => {
          if (a.score == null && b.score == null) {
            return a.i - b.i;
          }
          if (a.score == null) {
            return 1;
          }
          if (b.score == null) {
            return -1;
          }
          return b.score - a.score || a.i - b.i;
        })
        .map(({ d }) => d)
    : descriptors;
  return ordered.map((descriptor) => ({
    dimensionId: descriptor.id,
    dimensionType: descriptor.dimensionType,
    label: descriptor.displayName,
  }));
}
