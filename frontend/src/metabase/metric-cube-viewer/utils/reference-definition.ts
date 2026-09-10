import { findFilterDimensionById } from "metabase/metrics-viewer/utils/dimension-lookup";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import type { MeasureId } from "metabase-types/api";

import type { CubeCatalog, CubeDimensionKey } from "../types";

export interface ReferenceFilterDimension {
  definition: MetricDefinition;
  dimension: DimensionMetadata;
}

/**
 * The definition a filter picker runs against: the first measure in the
 * catalog that has the dimension and resolves it as a filterable dimension.
 */
export function findReferenceFilterDimension(
  catalog: CubeCatalog,
  definitions: Map<MeasureId, MetricDefinition>,
  dimensionKey: CubeDimensionKey,
): ReferenceFilterDimension | null {
  for (const measure of catalog.measures) {
    const dimensionId = measure.dimensionIds[dimensionKey];
    const definition = definitions.get(measure.id);
    if (dimensionId == null || !definition) {
      continue;
    }
    const dimension = findFilterDimensionById(definition, dimensionId);
    if (dimension) {
      return { definition, dimension };
    }
  }
  return null;
}
