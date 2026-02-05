import type {
  BooleanFilterParts,
  CoordinateFilterParts,
  DefaultFilterParts,
  DimensionMetadata,
  ExcludeDateFilterParts,
  FilterClause,
  FilterParts,
  MeasureMetadata,
  MetricDefinition,
  MetricMetadata,
  NumberFilterParts,
  RelativeDateFilterParts,
  SpecificDateFilterParts,
  StringFilterParts,
  TimeFilterParts,
} from "./types";

export function filters(_definition: MetricDefinition): FilterClause[] {
  throw new Error("Not implemented");
}

export function filterableMetrics(
  _definition: MetricDefinition,
): MetricMetadata[] {
  throw new Error("Not implemented");
}

export function filterableMeasures(
  _definition: MetricDefinition,
): MeasureMetadata[] {
  throw new Error("Not implemented");
}

export function filterableDimensions(
  _definition: MetricDefinition,
): DimensionMetadata[] {
  throw new Error("Not implemented");
}

export function filter(
  _definition: MetricDefinition,
  _filterClause: FilterClause,
): MetricDefinition {
  throw new Error("Not implemented");
}

export function stringFilterClause(_parts: StringFilterParts): FilterClause {
  throw new Error("Not implemented");
}

export function stringFilterParts(
  _definition: MetricDefinition,
  _filterClause: FilterClause,
): StringFilterParts | null {
  throw new Error("Not implemented");
}

export function numberFilterClause(_parts: NumberFilterParts): FilterClause {
  throw new Error("Not implemented");
}

export function numberFilterParts(
  _definition: MetricDefinition,
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
  _definition: MetricDefinition,
  _filterClause: FilterClause,
): CoordinateFilterParts | null {
  throw new Error("Not implemented");
}

export function booleanFilterClause(_parts: BooleanFilterParts): FilterClause {
  throw new Error("Not implemented");
}

export function booleanFilterParts(
  _definition: MetricDefinition,
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
  _definition: MetricDefinition,
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
  _definition: MetricDefinition,
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
  _definition: MetricDefinition,
  _filterClause: FilterClause,
): ExcludeDateFilterParts | null {
  throw new Error("Not implemented");
}

export function timeFilterClause(_parts: TimeFilterParts): FilterClause {
  throw new Error("Not implemented");
}

export function timeFilterParts(
  _definition: MetricDefinition,
  _filterClause: FilterClause,
): TimeFilterParts | null {
  throw new Error("Not implemented");
}

export function defaultFilterClause(_parts: DefaultFilterParts): FilterClause {
  throw new Error("Not implemented");
}

export function defaultFilterParts(
  _definition: MetricDefinition,
  _filterClause: FilterClause,
): DefaultFilterParts | null {
  throw new Error("Not implemented");
}

export function filterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): FilterParts | null {
  return (
    stringFilterParts(definition, filterClause) ??
    numberFilterParts(definition, filterClause) ??
    coordinateFilterParts(definition, filterClause) ??
    booleanFilterParts(definition, filterClause) ??
    specificDateFilterParts(definition, filterClause) ??
    relativeDateFilterParts(definition, filterClause) ??
    excludeDateFilterParts(definition, filterClause) ??
    timeFilterParts(definition, filterClause) ??
    defaultFilterParts(definition, filterClause)
  );
}
