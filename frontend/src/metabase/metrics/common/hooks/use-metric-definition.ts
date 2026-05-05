import { useMemo } from "react";

import { useGetMetricQuery } from "metabase/api";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { MetricId } from "metabase-types/api/metric";

export function useMetricDefinition(metricId: MetricId | null): {
  definition: MetricDefinition | null;
  isLoading: boolean;
} {
  const { data: metric, isLoading } = useGetMetricQuery(metricId!, {
    skip: metricId == null,
  });

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

  return { definition, isLoading };
}
