import type {
  BooleanFilterParts,
  CoordinateFilterParts,
  DefaultFilterParts,
  DimensionMetadata,
  ExcludeDateFilterParts,
  FilterClause,
  FilterParts,
  MetricDefinition,
  NumberFilterParts,
  RelativeDateFilterParts,
  SourceMetadata,
  SpecificDateFilterParts,
  StringFilterParts,
  TimeFilterParts,
} from "./types";

export function filters(
  _metricDefinition: MetricDefinition,
  _source: SourceMetadata,
): FilterClause[] {
  throw new Error("Not implemented");
}

export function filterableDimensions(
  _metricDefinition: MetricDefinition,
  _source: SourceMetadata,
): DimensionMetadata[] {
  throw new Error("Not implemented");
}

export function filter(
  _metricDefinition: MetricDefinition,
  _source: SourceMetadata,
  _filter: FilterClause,
): MetricDefinition {
  throw new Error("Not implemented");
}

export function stringFilterClause(_parts: StringFilterParts): FilterClause {
  throw new Error("Not implemented");
}

export function stringFilterParts(
  _metricDefinition: MetricDefinition,
  _source: SourceMetadata,
  _filterClause: FilterClause,
): StringFilterParts | null {
  throw new Error("Not implemented");
}

export function numberFilterClause(_parts: NumberFilterParts): FilterClause {
  throw new Error("Not implemented");
}

export function numberFilterParts(
  _metricDefinition: MetricDefinition,
  _source: SourceMetadata,
  _filterClause: FilterClause,
): NumberFilterParts | null {
  throw new Error("Not implemented");
}

export function coordinateFilterClause(
  _parts: CoordinateFilterParts,
): FilterClause {
  throw new Error("Not implemented");
}

export function coordinateFilterParts(
  _metricDefinition: MetricDefinition,
  _source: SourceMetadata,
  _filterClause: FilterClause,
): CoordinateFilterParts | null {
  throw new Error("Not implemented");
}

export function booleanFilterClause(_parts: BooleanFilterParts): FilterClause {
  throw new Error("Not implemented");
}

export function booleanFilterParts(
  _metricDefinition: MetricDefinition,
  _source: SourceMetadata,
  _filterClause: FilterClause,
): BooleanFilterParts | null {
  throw new Error("Not implemented");
}

export function specificDateFilterClause(
  _parts: SpecificDateFilterParts,
): FilterClause {
  throw new Error("Not implemented");
}

export function specificDateFilterParts(
  _metricDefinition: MetricDefinition,
  _source: SourceMetadata,
  _filterClause: FilterClause,
): SpecificDateFilterParts | null {
  throw new Error("Not implemented");
}

export function relativeDateFilterClause(
  _parts: RelativeDateFilterParts,
): FilterClause {
  throw new Error("Not implemented");
}

export function relativeDateFilterParts(
  _metricDefinition: MetricDefinition,
  _source: SourceMetadata,
  _filterClause: FilterClause,
): RelativeDateFilterParts | null {
  throw new Error("Not implemented");
}

export function excludeDateFilterClause(
  _parts: ExcludeDateFilterParts,
): FilterClause {
  throw new Error("Not implemented");
}

export function excludeDateFilterParts(
  _metricDefinition: MetricDefinition,
  _source: SourceMetadata,
  _filterClause: FilterClause,
): ExcludeDateFilterParts | null {
  throw new Error("Not implemented");
}

export function timeFilterClause(_parts: TimeFilterParts): FilterClause {
  throw new Error("Not implemented");
}

export function timeFilterParts(
  _metricDefinition: MetricDefinition,
  _source: SourceMetadata,
  _filterClause: FilterClause,
): TimeFilterParts | null {
  throw new Error("Not implemented");
}

export function defaultFilterClause(_parts: DefaultFilterParts): FilterClause {
  throw new Error("Not implemented");
}

export function defaultFilterParts(
  _metricDefinition: MetricDefinition,
  _source: SourceMetadata,
  _filterClause: FilterClause,
): DefaultFilterParts | null {
  throw new Error("Not implemented");
}

export function filterParts(
  metricDefinition: MetricDefinition,
  source: SourceMetadata,
  filterClause: FilterClause,
): FilterParts | null {
  return (
    stringFilterParts(metricDefinition, source, filterClause) ??
    numberFilterParts(metricDefinition, source, filterClause) ??
    coordinateFilterParts(metricDefinition, source, filterClause) ??
    booleanFilterParts(metricDefinition, source, filterClause) ??
    specificDateFilterParts(metricDefinition, source, filterClause) ??
    relativeDateFilterParts(metricDefinition, source, filterClause) ??
    excludeDateFilterParts(metricDefinition, source, filterClause) ??
    timeFilterParts(metricDefinition, source, filterClause) ??
    defaultFilterParts(metricDefinition, source, filterClause)
  );
}
