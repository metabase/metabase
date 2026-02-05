import { displayInfo } from "./metadata";
import type {
  Clause,
  DimensionMetadata,
  MetricDefinition,
  TemporalBucket,
} from "./types";

export function temporalBucket(
  _clause: Clause | DimensionMetadata,
): TemporalBucket | null {
  throw new Error("Not implemented");
}

export function availableTemporalBuckets(
  _definition: MetricDefinition,
  _dimension: DimensionMetadata,
): TemporalBucket[] {
  throw new Error("Not implemented");
}

export function isTemporalBucketable(
  definition: MetricDefinition,
  dimension: DimensionMetadata,
): boolean {
  return availableTemporalBuckets(definition, dimension).length > 0;
}

export function withTemporalBucket(
  _dimension: DimensionMetadata,
  _bucket: TemporalBucket | null,
): DimensionMetadata {
  throw new Error("Not implemented");
}

export function withDefaultTemporalBucket(
  definition: MetricDefinition,
  dimension: DimensionMetadata,
): DimensionMetadata {
  const bucket = defaultTemporalBucket(definition, dimension);
  return bucket ? withTemporalBucket(dimension, bucket) : dimension;
}

export function defaultTemporalBucket(
  definition: MetricDefinition,
  dimension: DimensionMetadata,
): TemporalBucket | null {
  const buckets = availableTemporalBuckets(definition, dimension);
  const bucket = buckets.find((b) => displayInfo(definition, b).default);

  return bucket ?? null;
}
