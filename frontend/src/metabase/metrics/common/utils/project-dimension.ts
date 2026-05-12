import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

export function projectDimension(
  definition: MetricDefinition,
  dimension: DimensionMetadata,
): MetricDefinition {
  const dimensionRef = LibMetric.dimensionReference(dimension);
  const projected = LibMetric.project(definition, dimensionRef);

  const projections = LibMetric.projections(projected);
  if (projections.length === 0) {
    return projected;
  }

  const projection = projections[projections.length - 1];
  const projectedDimension = LibMetric.projectionDimension(
    projected,
    projection,
  );
  if (!projectedDimension) {
    return projected;
  }

  if (LibMetric.isTemporalBucketable(projected, projectedDimension)) {
    return LibMetric.replaceClause(
      projected,
      projection,
      LibMetric.withDefaultTemporalBucket(projected, projection),
    );
  }

  if (LibMetric.isBinnable(projected, projectedDimension)) {
    return LibMetric.replaceClause(
      projected,
      projection,
      LibMetric.withDefaultBinning(projected, projection),
    );
  }

  return projected;
}
