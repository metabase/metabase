import { getDimensionDescriptors } from "metabase/common/metrics/utils/dimension-descriptors";
import type { DimensionType } from "metabase/common/metrics/utils/dimension-types";
import type { MetricDefinition } from "metabase-lib/metric";
import type { MetricDimension } from "metabase-types/api";

export interface OverviewDimension {
  dimensionId: string;
  dimensionType: DimensionType;
  label: string;
}

export function getOverviewDimensions(
  definition: MetricDefinition,
  dimensions: MetricDimension[],
): OverviewDimension[] {
  const descriptors = getDimensionDescriptors(definition);

  return dimensions.flatMap((dimension) => {
    const descriptor = descriptors.get(dimension.id);
    if (dimension.status === "status/orphaned" || !descriptor) {
      return [];
    }

    return [
      {
        dimensionId: descriptor.id,
        dimensionType: descriptor.dimensionType,
        label: descriptor.displayName,
      },
    ];
  });
}
