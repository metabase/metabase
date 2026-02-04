import type {
  DimensionMetadata,
  FilterClause,
  MetricDefinition,
  MetricSource,
} from "./types";

export function filters(
  _metricDefinition: MetricDefinition,
  _source: MetricSource,
): FilterClause[] {
  throw new Error("Not implemented");
}

export function filterableDimensions(
  _metricDefinition: MetricDefinition,
  _source: MetricSource,
): DimensionMetadata[] {
  throw new Error("Not implemented");
}

export function filter(
  _metricDefinition: MetricDefinition,
  _source: MetricSource,
  _filter: FilterClause,
): MetricDefinition {
  throw new Error("Not implemented");
}
