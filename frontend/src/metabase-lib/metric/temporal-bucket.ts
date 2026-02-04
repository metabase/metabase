import { displayInfo } from "./metadata";
import type {
  Clause,
  DimensionMetadata,
  MetricDefinition,
  SourceMetadata,
  TemporalBucket,
} from "./types";

export function temporalBucket(
  _clause: Clause | DimensionMetadata,
): TemporalBucket | null {
  throw new Error("Not implemented");
}

export function availableTemporalBuckets(
  _metricDefinition: MetricDefinition,
  _source: SourceMetadata,
  _dimension: DimensionMetadata,
): TemporalBucket[] {
  throw new Error("Not implemented");
}

export function isTemporalBucketable(
  metricDefinition: MetricDefinition,
  source: SourceMetadata,
  dimension: DimensionMetadata,
): boolean {
  return (
    availableTemporalBuckets(metricDefinition, source, dimension).length > 0
  );
}

export function withTemporalBucket(
  _dimension: DimensionMetadata,
  _bucket: TemporalBucket | null,
): DimensionMetadata {
  throw new Error("Not implemented");
}

export function withDefaultTemporalBucket(
  metricDefinition: MetricDefinition,
  source: SourceMetadata,
  dimension: DimensionMetadata,
): DimensionMetadata {
  const bucket = defaultTemporalBucket(metricDefinition, source, dimension);
  return bucket ? withTemporalBucket(dimension, bucket) : dimension;
}

export function defaultTemporalBucket(
  metricDefinition: MetricDefinition,
  source: SourceMetadata,
  dimension: DimensionMetadata,
): TemporalBucket | null {
  const buckets = availableTemporalBuckets(metricDefinition, source, dimension);
  const bucket = buckets.find((b) => displayInfo(metricDefinition, b).default);

  return bucket ?? null;
}
