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
  metadataProvider: MetadataProviderable,
  jsDefinition: JsMetricDefinition,
): MetricDefinition {
  return LibMetric.fromJsMetricDefinition(
    metadataProvider,
    jsDefinition,
  ) as MetricDefinition;
}

export function toJsMetricDefinition(
  definition: MetricDefinition,
): JsMetricDefinition {
  return LibMetric.toJsMetricDefinition(definition) as JsMetricDefinition;
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
  definition: MetricDefinition,
): DimensionMetadata[] {
  return LibMetric.filterableDimensions(definition) as DimensionMetadata[];
}

export function filter(
  definition: MetricDefinition,
  filterClause: FilterClause,
): MetricDefinition {
  return LibMetric.filter(definition, filterClause) as MetricDefinition;
}

export function stringFilterClause(parts: StringFilterParts): FilterClause {
  return LibMetric.stringFilterClause(parts) as FilterClause;
}

export function stringFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): StringFilterParts | null {
  return LibMetric.stringFilterParts(
    definition,
    filterClause,
  ) as StringFilterParts | null;
}

export function numberFilterClause(parts: NumberFilterParts): FilterClause {
  return LibMetric.numberFilterClause(parts) as FilterClause;
}

export function numberFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): NumberFilterParts | null {
  return LibMetric.numberFilterParts(
    definition,
    filterClause,
  ) as NumberFilterParts | null;
}

export function coordinateFilterClause(
  parts: CoordinateFilterParts,
): FilterClause {
  return LibMetric.coordinateFilterClause(parts) as FilterClause;
}

export function coordinateFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): CoordinateFilterParts | null {
  return LibMetric.coordinateFilterParts(
    definition,
    filterClause,
  ) as CoordinateFilterParts | null;
}

export function booleanFilterClause(parts: BooleanFilterParts): FilterClause {
  return LibMetric.booleanFilterClause(parts) as FilterClause;
}

export function booleanFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): BooleanFilterParts | null {
  return LibMetric.booleanFilterParts(
    definition,
    filterClause,
  ) as BooleanFilterParts | null;
}

export function specificDateFilterClause(
  parts: SpecificDateFilterParts,
): FilterClause {
  return LibMetric.specificDateFilterClause(parts) as FilterClause;
}

export function specificDateFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): SpecificDateFilterParts | null {
  return LibMetric.specificDateFilterParts(
    definition,
    filterClause,
  ) as SpecificDateFilterParts | null;
}

export function relativeDateFilterClause(
  parts: RelativeDateFilterParts,
): FilterClause {
  return LibMetric.relativeDateFilterClause(parts) as FilterClause;
}

export function relativeDateFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): RelativeDateFilterParts | null {
  return LibMetric.relativeDateFilterParts(
    definition,
    filterClause,
  ) as RelativeDateFilterParts | null;
}

export function excludeDateFilterClause(
  parts: ExcludeDateFilterParts,
): FilterClause {
  return LibMetric.excludeDateFilterClause(parts) as FilterClause;
}

export function excludeDateFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): ExcludeDateFilterParts | null {
  return LibMetric.excludeDateFilterParts(
    definition,
    filterClause,
  ) as ExcludeDateFilterParts | null;
}

export function timeFilterClause(parts: TimeFilterParts): FilterClause {
  return LibMetric.timeFilterClause(parts) as FilterClause;
}

export function timeFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): TimeFilterParts | null {
  return LibMetric.timeFilterParts(
    definition,
    filterClause,
  ) as TimeFilterParts | null;
}

export function defaultFilterClause(parts: DefaultFilterParts): FilterClause {
  return LibMetric.defaultFilterClause(parts) as FilterClause;
}

export function defaultFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): DefaultFilterParts | null {
  return LibMetric.defaultFilterParts(
    definition,
    filterClause,
  ) as DefaultFilterParts | null;
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
  definition: MetricDefinition,
): DimensionMetadata[] {
  return LibMetric.projectionableDimensions(definition) as DimensionMetadata[];
}

export function project(
  definition: MetricDefinition,
  projectionClause: ProjectionClause,
): MetricDefinition {
  return LibMetric.project(definition, projectionClause) as MetricDefinition;
}

export function replaceClause(
  definition: MetricDefinition,
  targetClause: Clause,
  newClause: Clause,
): MetricDefinition {
  return LibMetric.replaceClause(
    definition,
    targetClause,
    newClause,
  ) as MetricDefinition;
}

export function removeClause(
  definition: MetricDefinition,
  clause: Clause,
): MetricDefinition {
  return LibMetric.removeClause(definition, clause) as MetricDefinition;
}

export function temporalBucket(
  clause: Clause | DimensionMetadata,
): TemporalBucket | null {
  return LibMetric.temporalBucket(clause) as TemporalBucket | null;
}

export function availableTemporalBuckets(
  definition: MetricDefinition,
  dimension: DimensionMetadata,
): TemporalBucket[] {
  return LibMetric.availableTemporalBuckets(
    definition,
    dimension,
  ) as TemporalBucket[];
}

export function isTemporalBucketable(
  definition: MetricDefinition,
  dimension: DimensionMetadata,
): boolean {
  return availableTemporalBuckets(definition, dimension).length > 0;
}

export function withTemporalBucket(
  dimension: DimensionMetadata,
  bucket: TemporalBucket | null,
): DimensionMetadata {
  return LibMetric.withTemporalBucket(dimension, bucket) as DimensionMetadata;
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
  clause: Clause | DimensionMetadata,
): BinningStrategy | null {
  return LibMetric.binning(clause) as BinningStrategy | null;
}

export function availableBinningStrategies(
  definition: MetricDefinition,
  dimension: DimensionMetadata,
): BinningStrategy[] {
  return LibMetric.availableBinningStrategies(
    definition,
    dimension,
  ) as BinningStrategy[];
}

export function isBinnable(
  definition: MetricDefinition,
  dimension: DimensionMetadata,
): boolean {
  return availableBinningStrategies(definition, dimension).length > 0;
}

export function withBinning(
  dimension: DimensionMetadata,
  binningStrategy: BinningStrategy | null,
): DimensionMetadata {
  return LibMetric.withBinning(dimension, binningStrategy) as DimensionMetadata;
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

export const isBoolean: TypeFn = (dimension) => {
  return LibMetric.isBoolean(dimension) as boolean;
};

export const isCoordinate: TypeFn = (dimension) => {
  return LibMetric.isCoordinate(dimension) as boolean;
};

export const isTemporal: TypeFn = (dimension) => {
  return LibMetric.isTemporal(dimension) as boolean;
};

export const isDateOrDateTime: TypeFn = (dimension) => {
  return LibMetric.isDateOrDateTime(dimension) as boolean;
};

export const isForeignKey: TypeFn = (dimension) => {
  return LibMetric.isForeignKey(dimension) as boolean;
};

export const isLocation: TypeFn = (dimension) => {
  return LibMetric.isLocation(dimension) as boolean;
};

export const isLatitude: TypeFn = (dimension) => {
  return LibMetric.isLatitude(dimension) as boolean;
};

export const isLongitude: TypeFn = (dimension) => {
  return LibMetric.isLongitude(dimension) as boolean;
};

export const isNumeric: TypeFn = (dimension) => {
  return LibMetric.isNumeric(dimension) as boolean;
};

export const isPrimaryKey: TypeFn = (dimension) => {
  return LibMetric.isPrimaryKey(dimension) as boolean;
};

export const isStringLike: TypeFn = (dimension) => {
  return LibMetric.isStringLike(dimension) as boolean;
};

export const isStringOrStringLike: TypeFn = (dimension) => {
  return LibMetric.isStringOrStringLike(dimension) as boolean;
};

export const isTime: TypeFn = (dimension) => {
  return LibMetric.isTime(dimension) as boolean;
};

export function displayInfo(
  definition: MetricDefinition,
  metric: MetricMetadata,
): MetricDisplayInfo;
export function displayInfo(
  definition: MetricDefinition,
  measure: MeasureMetadata,
): MeasureDisplayInfo;
export function displayInfo(
  definition: MetricDefinition,
  clause: Clause,
): ClauseDisplayInfo;
export function displayInfo(
  definition: MetricDefinition,
  dimension: DimensionMetadata,
): DimensionDisplayInfo;
export function displayInfo(
  definition: MetricDefinition,
  temporalBucket: TemporalBucket,
): TemporalBucketDisplayInfo;
export function displayInfo(
  definition: MetricDefinition,
  binningStrategy: BinningStrategy,
): BinningStrategyDisplayInfo;
export function displayInfo(
  definition: MetricDefinition,
  filterParts: Displayable,
): DisplayInfo;
export function displayInfo(
  definition: MetricDefinition,
  source: Displayable,
): DisplayInfo {
  return LibMetric.displayInfo(definition, source) as DisplayInfo;
}

export function dimensionValuesInfo(
  definition: MetricDefinition,
  dimension: DimensionMetadata,
): DimensionValuesInfo {
  return LibMetric.dimensionValuesInfo(
    definition,
    dimension,
  ) as DimensionValuesInfo;
}
