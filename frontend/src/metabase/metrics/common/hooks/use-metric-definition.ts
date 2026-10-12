import { useMemo } from "react";

import { useGetMetricQuery } from "metabase/api";
import { useMetricMetadataProvider } from "metabase/metadata-store";
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

  const provider = useMetricMetadataProvider();

  const definition = useMemo(() => {
    if (!metric || metricId == null) {
      return null;
    }
    const meta = LibMetric.metricMetadata(provider, metricId);
    if (!meta) {
      return null;
    }
    return LibMetric.fromMetricMetadata(provider, meta);
  }, [metric, provider, metricId]);

  return { definition, isLoading };
}
