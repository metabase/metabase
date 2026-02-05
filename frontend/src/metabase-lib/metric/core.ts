import * as LibMetric from "cljs/metabase.lib_metric.js";
import type {
  JsMetricDefinition,
  MeasureId,
  MetricId,
} from "metabase-types/api";

import type {
  BinningStrategy,
  BinningStrategyDisplayInfo,
  BooleanFilterParts,
  Clause,
  ClauseDisplayInfo,
  CoordinateFilterParts,
  DefaultFilterParts,
  DimensionDisplayInfo,
  DimensionMetadata,
  DimensionValuesInfo,
  DisplayInfo,
  Displayable,
  ExcludeDateFilterParts,
  FilterClause,
  FilterParts,
  JsMetadataProvider,
  MeasureDisplayInfo,
  MeasureMetadata,
  MetadataProvider,
  MetadataProviderable,
  MetricDefinition,
  MetricDisplayInfo,
  MetricMetadata,
  NumberFilterParts,
  ProjectionClause,
  RelativeDateFilterParts,
  SpecificDateFilterParts,
  StringFilterParts,
  TemporalBucket,
  TemporalBucketDisplayInfo,
  TimeFilterParts,
} from "./types";

export function metadataProvider(
  jsMetadata: JsMetadataProvider,
): MetadataProvider {
  return LibMetric.metadataProvider(jsMetadata) as MetadataProvider;
}

export function metricMetadata(
  metadataProvider: MetadataProviderable,
  metricId: MetricId,
): MetricMetadata | null {
  return LibMetric.metricMetadata(
    metadataProvider,
    metricId,
  ) as MetricMetadata | null;
}

export function measureMetadata(
  metadataProvider: MetadataProviderable,
  measureId: MeasureId,
): MeasureMetadata | null {
  return LibMetric.measureMetadata(
    metadataProvider,
    measureId,
  ) as MeasureMetadata | null;
}

export function fromMetricMetadata(
  metadataProvider: MetadataProviderable,
  metricMetadata: MetricMetadata,
): MetricDefinition {
  return LibMetric.fromMetricMetadata(
    metadataProvider,
    metricMetadata,
  ) as MetricDefinition;
}

export function fromMeasureMetadata(
  metadataProvider: MetadataProviderable,
  measureMetadata: MeasureMetadata,
): MetricDefinition {
  return LibMetric.fromMeasureMetadata(
    metadataProvider,
    measureMetadata,
  ) as MetricDefinition;
}

export function fromJsMetricDefinition(
  _jsDefinition: JsMetricDefinition,
): MetricDefinition {
  throw new Error("Not implemented");
}

export function toJsMetricDefinition(
  _definition: MetricDefinition,
): JsMetricDefinition {
  throw new Error("Not implemented");
}

export function sourceMetricId(definition: MetricDefinition): MetricId | null {
  return LibMetric.sourceMetricId(definition) as MetricId | null;
}

export function sourceMeasureId(
  definition: MetricDefinition,
): MeasureId | null {
  return LibMetric.sourceMeasureId(definition) as MeasureId | null;
}

export function filters(definition: MetricDefinition): FilterClause[] {
  return LibMetric.filters(definition) as FilterClause[];
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

export function projections(definition: MetricDefinition): ProjectionClause[] {
  return LibMetric.projections(definition) as ProjectionClause[];
}

export function projectionableDimensions(
  _definition: MetricDefinition,
): DimensionMetadata[] {
  throw new Error("Not implemented");
}

export function project(
  _definition: MetricDefinition,
  _projectionClause: ProjectionClause,
): MetricDefinition {
  throw new Error("Not implemented");
}

export function replaceClause(
  _definition: MetricDefinition,
  _targetClause: Clause,
  _newClause: Clause,
): MetricDefinition {
  throw new Error("Not implemented");
}

export function removeClause(
  _definition: MetricDefinition,
  _clause: Clause,
): MetricDefinition {
  throw new Error("Not implemented");
}

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

export function binning(
  _clause: Clause | DimensionMetadata,
): BinningStrategy | null {
  throw new Error("Not implemented");
}

export function availableBinningStrategies(
  _definition: MetricDefinition,
  _dimension: DimensionMetadata,
): BinningStrategy[] {
  throw new Error("Not implemented");
}

export function isBinnable(
  definition: MetricDefinition,
  dimension: DimensionMetadata,
): boolean {
  return availableBinningStrategies(definition, dimension).length > 0;
}

export function withBinning(
  _dimension: DimensionMetadata,
  _binningStrategy: BinningStrategy | null,
): DimensionMetadata {
  throw new Error("Not implemented");
}

export function withDefaultBinning(
  definition: MetricDefinition,
  dimension: DimensionMetadata,
): DimensionMetadata {
  const strategies = availableBinningStrategies(definition, dimension);
  const defaultStrategy = strategies.find(
    (strategy) => displayInfo(definition, strategy).default,
  );
  return defaultStrategy ? withBinning(dimension, defaultStrategy) : dimension;
}

type TypeFn = (dimension: DimensionMetadata) => boolean;

export const isBoolean: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isCoordinate: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isTemporal: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isDateOrDateTime: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isForeignKey: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isLocation: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isLatitude: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isLongitude: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isNumeric: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isPrimaryKey: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isStringLike: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isStringOrStringLike: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isTime: TypeFn = () => {
  throw new Error("Not implemented");
};

export function displayInfo(
  _definition: MetricDefinition,
  _metric: MetricMetadata,
): MetricDisplayInfo;
export function displayInfo(
  _definition: MetricDefinition,
  _measure: MeasureMetadata,
): MeasureDisplayInfo;
export function displayInfo(
  _definition: MetricDefinition,
  _clause: Clause,
): ClauseDisplayInfo;
export function displayInfo(
  _definition: MetricDefinition,
  _dimension: DimensionMetadata,
): DimensionDisplayInfo;
export function displayInfo(
  _definition: MetricDefinition,
  _temporalBucket: TemporalBucket,
): TemporalBucketDisplayInfo;
export function displayInfo(
  _definition: MetricDefinition,
  _binningStrategy: BinningStrategy,
): BinningStrategyDisplayInfo;
export function displayInfo(
  _definition: MetricDefinition,
  _filterParts: Displayable,
): DisplayInfo;
export function displayInfo(
  _definition: MetricDefinition,
  _source: Displayable,
): DisplayInfo {
  throw new Error("Not implemented");
}

export function dimensionValuesInfo(
  _definition: MetricDefinition,
  _dimension: DimensionMetadata,
): DimensionValuesInfo {
  throw new Error("Not implemented");
}
