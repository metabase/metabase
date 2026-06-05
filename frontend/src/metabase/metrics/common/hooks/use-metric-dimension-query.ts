import { useMemo } from "react";

import { skipToken, useGetMetricDatasetQuery } from "metabase/api";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import { getDimensionDescriptors } from "../utils/dimension-descriptors";
import { projectDimension } from "../utils/project-dimension";

export function useMetricDimensionQuery(
  definition: MetricDefinition,
  dimensionId: string,
) {
  const request = useMemo(() => {
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
