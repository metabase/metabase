import { useMemo } from "react";

import { skipToken, useGetMetricDatasetQuery } from "metabase/api";
import { getDimensionDescriptors } from "metabase/common/metrics/utils/dimension-descriptors";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import { projectDimension } from "../utils/project-dimension";

export function useMetricDimensionQuery(
  definition: MetricDefinition | null,
  dimensionId: string | null,
) {
  const request = useMemo(() => {
    if (!definition || !dimensionId) {
      return null;
    }

    const descriptor = getDimensionDescriptors(definition).get(dimensionId);
    if (!descriptor) {
      return null;
    }

    const projected = projectDimension(
      definition,
      descriptor.dimensionMetadata,
    );
    return { definition: LibMetric.toJsMetricDefinition(projected) };
  }, [definition, dimensionId]);

  return useGetMetricDatasetQuery(request ?? skipToken);
}
