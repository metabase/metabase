import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { TemporalUnit } from "metabase-types/api";

export function findDimensionById(
  def: MetricDefinition,
  dimensionId: string,
): DimensionMetadata | undefined {
  return LibMetric.projectionableDimensions(def).find((dimension) => {
    const info = LibMetric.dimensionValuesInfo(def, dimension);
    return info.id === dimensionId;
  });
}

export function findFilterDimensionById(
  def: MetricDefinition,
  dimensionId: string,
): DimensionMetadata | undefined {
  return LibMetric.filterableDimensions(def).find((dimension) => {
    const info = LibMetric.dimensionValuesInfo(def, dimension);
    return info.id === dimensionId;
  });
}

export function findTemporalBucket(
  def: MetricDefinition,
  dimension: DimensionMetadata,
  targetUnit: TemporalUnit,
): LibMetric.TemporalBucket | null {
  const buckets = LibMetric.availableTemporalBuckets(def, dimension);
  const bucket = buckets.find((bucket) => {
    const info = LibMetric.displayInfo(def, bucket);
    return info.shortName === targetUnit;
  });
  return bucket ?? null;
}

export function findBinningStrategy(
  def: MetricDefinition,
  dimension: DimensionMetadata,
  strategyName: string,
): LibMetric.BinningStrategy | null {
  const strategies = LibMetric.availableBinningStrategies(def, dimension);
  return (
    strategies.find(
      (strategy) =>
        LibMetric.displayInfo(def, strategy).displayName === strategyName,
    ) ?? null
  );
}
