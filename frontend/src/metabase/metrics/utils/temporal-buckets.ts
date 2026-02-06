import * as LibMetric from "metabase-lib/metric";
import type { TemporalUnit } from "metabase-types/api";

import type { DimensionWithDefinition } from "../types";

export function getTemporalUnits(
  definition: LibMetric.MetricDefinition,
  dimension: LibMetric.DimensionMetadata,
): TemporalUnit[] {
  return LibMetric.availableTemporalBuckets(definition, dimension).map(
    (bucket) => {
      const bucketInfo = LibMetric.displayInfo(definition, bucket);
      return bucketInfo.shortName;
    },
  );
}

export function getCommonTemporalUnits(
  dimensions: DimensionWithDefinition[],
): TemporalUnit[] {
  if (dimensions.length === 0) {
    return [];
  }

  const initialUnits = getTemporalUnits(
    dimensions[0].definition,
    dimensions[0].dimension,
  );
  return dimensions.reduce((availableUnits, dimension) => {
    const currentUnits = new Set(
      getTemporalUnits(dimension.definition, dimension.dimension),
    );
    return availableUnits.filter((unit) => currentUnits.has(unit));
  }, initialUnits);
}
