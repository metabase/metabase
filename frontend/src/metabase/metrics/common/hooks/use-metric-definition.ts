import { useMemo } from "react";

import { useGetMetricQuery } from "metabase/api";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { DimensionId } from "metabase-types/api/measure";
import type { MetricId } from "metabase-types/api/metric";

export function useMetricDefinition(
  metricId: MetricId | null,
  {
    sortDimensionsByInterestingness,
  }: { sortDimensionsByInterestingness?: boolean } = {},
): {
  definition: MetricDefinition | null;
  /**
   * Per-dimension `dimension_interestingness` scores from the API response, keyed by
   * dimension id. The lib-metric `definition` is rebuilt from local Redux metadata and
   * doesn't carry these scores, so consumers that want to order dimensions by
   * interestingness need to look them up here.
   */
  dimensionScores: Map<DimensionId, number | null>;
  isLoading: boolean;
} {
  const { data: metric, isLoading } = useGetMetricQuery(
    { id: metricId!, sortDimensionsByInterestingness },
    { skip: metricId == null },
  );

  const metadata = useSelector(getMetadata);

  const definition = useMemo(() => {
    if (!metric || !metadata || metricId == null) {
      return null;
    }
    const provider = LibMetric.metadataProvider(metadata);
    const meta = LibMetric.metricMetadata(provider, metricId);
    if (!meta) {
      return null;
    }
    return LibMetric.fromMetricMetadata(provider, meta);
  }, [metric, metadata, metricId]);

  const dimensionScores = useMemo(() => {
    const scores = new Map<DimensionId, number | null>();
    for (const d of metric?.dimensions ?? []) {
      scores.set(d.id, d.dimension_interestingness ?? null);
    }
    return scores;
  }, [metric]);

  return { definition, dimensionScores, isLoading };
}
