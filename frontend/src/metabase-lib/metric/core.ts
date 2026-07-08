import dayjs, { type Dayjs } from "dayjs";

import * as LibMetric from "cljs/metabase.lib_metric.js";
import type { Metadata } from "metabase-lib";
import type {
  ConcreteTableId,
  JsMetricDefinition,
  MeasureId,
  MetricId,
  SegmentId,
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
  SegmentDisplayInfo,
  SegmentMetadata,
  SourceInstance,
  SpecificDateFilterParts,
  StringFilterParts,
  TemporalBucket,
  TemporalBucketDisplayInfo,
  TimeFilterParts,
} from "./types";

export function metadataProvider(jsMetadata: Metadata): MetadataProvider {
  // Unjustified type cast. FIXME
  return LibMetric.metadataProvider(jsMetadata) as MetadataProvider;
}

export function metricMetadata(
  metadataProvider: MetadataProviderable,
  metricId: MetricId,
): MetricMetadata | null {
  // Unjustified type cast. FIXME
  return LibMetric.metricMetadata(
    metadataProvider,
    metricId,
  ) as MetricMetadata | null;
}

export function measureMetadata(
  metadataProvider: MetadataProviderable,
  measureId: MeasureId,
): MeasureMetadata | null {
  // Unjustified type cast. FIXME
  return LibMetric.measureMetadata(
    metadataProvider,
    measureId,
  ) as MeasureMetadata | null;
}

export function fromMetricMetadata(
  metadataProvider: MetadataProviderable,
  metricMetadata: MetricMetadata,
): MetricDefinition {
  // Unjustified type cast. FIXME
  return LibMetric.fromMetricMetadata(
    metadataProvider,
    metricMetadata,
  ) as MetricDefinition;
}

export function fromMeasureMetadata(
  metadataProvider: MetadataProviderable,
  measureMetadata: MeasureMetadata,
): MetricDefinition {
  // Unjustified type cast. FIXME
  return LibMetric.fromMeasureMetadata(
    metadataProvider,
    measureMetadata,
  ) as MetricDefinition;
}

export function fromJsMetricDefinition(
  metadataProvider: MetadataProviderable,
  jsDefinition: JsMetricDefinition,
): MetricDefinition {
  // Unjustified type cast. FIXME
  return LibMetric.fromJsMetricDefinition(
    metadataProvider,
    jsDefinition,
  ) as MetricDefinition;
}

export function toJsMetricDefinition(
  definition: MetricDefinition,
): JsMetricDefinition {
  // Unjustified type cast. FIXME
  return LibMetric.toJsMetricDefinition(definition) as JsMetricDefinition;
}

export function sourceMetricId(definition: MetricDefinition): MetricId | null {
  // Unjustified type cast. FIXME
  return LibMetric.sourceMetricId(definition) as MetricId | null;
}

export function sourceMetricMetadata(
  definition: MetricDefinition,
): MetricMetadata | null {
  const metricId = sourceMetricId(definition);
  return metricId != null ? metricMetadata(definition, metricId) : null;
}

export function sourceMeasureId(
  definition: MetricDefinition,
): MeasureId | null {
  // Unjustified type cast. FIXME
  return LibMetric.sourceMeasureId(definition) as MeasureId | null;
}

export function sourceMeasureTableId(
  definition: MetricDefinition,
): ConcreteTableId | null {
  // Unjustified type cast. FIXME
  return LibMetric.sourceMeasureTableId(definition) as ConcreteTableId | null;
}

export function sourceMeasureMetadata(
  definition: MetricDefinition,
): MeasureMetadata | null {
  const measureId = sourceMeasureId(definition);
  return measureId != null ? measureMetadata(definition, measureId) : null;
}

export function sourceMetricOrMeasureMetadata(
  definition: MetricDefinition,
): MetricMetadata | MeasureMetadata | null {
  return sourceMetricMetadata(definition) ?? sourceMeasureMetadata(definition);
}

export function sourceInstances(
  definition: MetricDefinition,
): SourceInstance[] {
  // Unjustified type cast. FIXME
  return LibMetric.sourceInstances(definition) as SourceInstance[];
}

export function filters(definition: MetricDefinition): FilterClause[];
export function filters(
  definition: MetricDefinition,
  sourceInstance: SourceInstance,
): FilterClause[];
export function filters(
  definition: MetricDefinition,
  sourceInstance?: SourceInstance,
): FilterClause[] {
  if (sourceInstance !== undefined) {
    // Unjustified type cast. FIXME
    return LibMetric.filters(definition, sourceInstance) as FilterClause[];
  }
  // Unjustified type cast. FIXME
  return LibMetric.filters(definition) as FilterClause[];
}

export function filterableDimensions(
  definition: MetricDefinition,
): DimensionMetadata[];
export function filterableDimensions(
  definition: MetricDefinition,
  sourceInstance: SourceInstance,
): DimensionMetadata[];
export function filterableDimensions(
  definition: MetricDefinition,
  sourceInstance?: SourceInstance,
): DimensionMetadata[] {
  if (sourceInstance !== undefined) {
    // Unjustified type cast. FIXME
    return LibMetric.filterableDimensions(
      definition,
      sourceInstance,
    ) as DimensionMetadata[];
  }
  // Unjustified type cast. FIXME
  return LibMetric.filterableDimensions(definition) as DimensionMetadata[];
}

export function filter(
  definition: MetricDefinition,
  filterClause: FilterClause,
): MetricDefinition;
export function filter(
  definition: MetricDefinition,
  filterClause: FilterClause,
  sourceInstance: SourceInstance,
): MetricDefinition;
export function filter(
  definition: MetricDefinition,
  filterClause: FilterClause,
  sourceInstance?: SourceInstance,
): MetricDefinition {
  if (sourceInstance !== undefined) {
    // Unjustified type cast. FIXME
    return LibMetric.filter(
      definition,
      filterClause,
      sourceInstance,
    ) as MetricDefinition;
  }
  // Unjustified type cast. FIXME
  return LibMetric.filter(definition, filterClause) as MetricDefinition;
}

export function availableSegments(
  definition: MetricDefinition,
): SegmentMetadata[] {
  // Unjustified type cast. FIXME
  return LibMetric.availableSegments(definition) as SegmentMetadata[];
}

export function addSegmentFilter(
  definition: MetricDefinition,
  segment: SegmentMetadata,
): MetricDefinition {
  // Unjustified type cast. FIXME
  return LibMetric.addSegmentFilter(definition, segment) as MetricDefinition;
}

export function isSegmentFilter(filterClause: FilterClause): boolean {
  return Boolean(LibMetric.isSegmentFilter(filterClause));
}

export function segmentMetadataForFilter(
  definition: MetricDefinition,
  filterClause: FilterClause,
): SegmentMetadata | null {
  // Unjustified type cast. FIXME
  return LibMetric.segmentMetadataForFilter(
    definition,
    filterClause,
  ) as SegmentMetadata | null;
}

export function segmentMetadataId(segment: SegmentMetadata): SegmentId {
  // Unjustified type cast. FIXME
  return LibMetric.segmentMetadataId(segment) as SegmentId;
}

export function stringFilterClause(parts: StringFilterParts): FilterClause {
  // Unjustified type cast. FIXME
  return LibMetric.stringFilterClause(parts) as FilterClause;
}

export function stringFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): StringFilterParts | null {
  // Unjustified type cast. FIXME
  return LibMetric.stringFilterParts(
    definition,
    filterClause,
  ) as StringFilterParts | null;
}

export function numberFilterClause(parts: NumberFilterParts): FilterClause {
  // Unjustified type cast. FIXME
  return LibMetric.numberFilterClause(parts) as FilterClause;
}

export function numberFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): NumberFilterParts | null {
  // Unjustified type cast. FIXME
  return LibMetric.numberFilterParts(
    definition,
    filterClause,
  ) as NumberFilterParts | null;
}

export function coordinateFilterClause(
  parts: CoordinateFilterParts,
): FilterClause {
  // Unjustified type cast. FIXME
  return LibMetric.coordinateFilterClause(parts) as FilterClause;
}

export function coordinateFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): CoordinateFilterParts | null {
  // Unjustified type cast. FIXME
  return LibMetric.coordinateFilterParts(
    definition,
    filterClause,
  ) as CoordinateFilterParts | null;
}

export function booleanFilterClause(parts: BooleanFilterParts): FilterClause {
  // Unjustified type cast. FIXME
  return LibMetric.booleanFilterClause(parts) as FilterClause;
}

export function booleanFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): BooleanFilterParts | null {
  // Unjustified type cast. FIXME
  return LibMetric.booleanFilterParts(
    definition,
    filterClause,
  ) as BooleanFilterParts | null;
}

export function specificDateFilterClause(
  parts: SpecificDateFilterParts,
): FilterClause {
  // Unjustified type cast. FIXME
  return LibMetric.specificDateFilterClause(parts) as FilterClause;
}

export function specificDateFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): SpecificDateFilterParts | null {
  // Unjustified type cast. FIXME
  return LibMetric.specificDateFilterParts(
    definition,
    filterClause,
  ) as SpecificDateFilterParts | null;
}

export function relativeDateFilterClause(
  parts: RelativeDateFilterParts,
): FilterClause {
  // Unjustified type cast. FIXME
  return LibMetric.relativeDateFilterClause(parts) as FilterClause;
}

export function relativeDateFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): RelativeDateFilterParts | null {
  // Unjustified type cast. FIXME
  return LibMetric.relativeDateFilterParts(
    definition,
    filterClause,
  ) as RelativeDateFilterParts | null;
}

export function excludeDateFilterClause(
  parts: ExcludeDateFilterParts,
): FilterClause {
  // Unjustified type cast. FIXME
  return LibMetric.excludeDateFilterClause(parts) as FilterClause;
}

export function excludeDateFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): ExcludeDateFilterParts | null {
  // Unjustified type cast. FIXME
  return LibMetric.excludeDateFilterParts(
    definition,
    filterClause,
  ) as ExcludeDateFilterParts | null;
}

export function timeFilterClause(parts: TimeFilterParts): FilterClause {
  // Unjustified type cast. FIXME
  return LibMetric.timeFilterClause({
    ...parts,
    values: parts.values.map((value) => dayjs(value)),
  }) as FilterClause;
}

export function timeFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): TimeFilterParts | null {
  const filterParts = LibMetric.timeFilterParts(definition, filterClause);
  if (!filterParts) {
    return null;
  }
  return {
    ...filterParts,
    values: filterParts.values.map((value: Dayjs) => value.toDate()),
  };
}

export function defaultFilterClause(parts: DefaultFilterParts): FilterClause {
  // Unjustified type cast. FIXME
  return LibMetric.defaultFilterClause(parts) as FilterClause;
}

export function defaultFilterParts(
  definition: MetricDefinition,
  filterClause: FilterClause,
): DefaultFilterParts | null {
  // Unjustified type cast. FIXME
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

export function projections(definition: MetricDefinition): ProjectionClause[];
export function projections(
  definition: MetricDefinition,
  sourceInstance: SourceInstance,
): ProjectionClause[];
export function projections(
  definition: MetricDefinition,
  sourceInstance?: SourceInstance,
): ProjectionClause[] {
  if (sourceInstance !== undefined) {
    // Unjustified type cast. FIXME
    return LibMetric.projections(
      definition,
      sourceInstance,
    ) as ProjectionClause[];
  }
  // Unjustified type cast. FIXME
  return LibMetric.projections(definition) as ProjectionClause[];
}

export function defaultBreakoutDimensions(
  definition: MetricDefinition,
): DimensionMetadata[] {
  // Unjustified type cast. FIXME
  return LibMetric.defaultBreakoutDimensions(definition) as DimensionMetadata[];
}

export function projectionableDimensions(
  definition: MetricDefinition,
): DimensionMetadata[];
export function projectionableDimensions(
  definition: MetricDefinition,
  sourceInstance: SourceInstance,
): DimensionMetadata[];
export function projectionableDimensions(
  definition: MetricDefinition,
  sourceInstance?: SourceInstance,
): DimensionMetadata[] {
  if (sourceInstance !== undefined) {
    // Unjustified type cast. FIXME
    return LibMetric.projectionableDimensions(
      definition,
      sourceInstance,
    ) as DimensionMetadata[];
  }
  // Unjustified type cast. FIXME
  return LibMetric.projectionableDimensions(definition) as DimensionMetadata[];
}

export function dimensionReference(
  dimension: DimensionMetadata,
): ProjectionClause {
  // Unjustified type cast. FIXME
  return LibMetric.dimensionReference(dimension) as ProjectionClause;
}

export function project(
  definition: MetricDefinition,
  dimensionRef: ProjectionClause,
): MetricDefinition;
export function project(
  definition: MetricDefinition,
  dimensionRef: ProjectionClause,
  sourceInstance: SourceInstance,
): MetricDefinition;
export function project(
  definition: MetricDefinition,
  dimensionRef: ProjectionClause,
  sourceInstance?: SourceInstance,
): MetricDefinition {
  if (sourceInstance !== undefined) {
    // Unjustified type cast. FIXME
    return LibMetric.project(
      definition,
      dimensionRef,
      sourceInstance,
    ) as MetricDefinition;
  }
  // Unjustified type cast. FIXME
  return LibMetric.project(definition, dimensionRef) as MetricDefinition;
}

export function projectionDimension(
  definition: MetricDefinition,
  dimension: ProjectionClause | DimensionMetadata,
): DimensionMetadata | null {
  // Unjustified type cast. FIXME
  return LibMetric.projectionDimension(
    definition,
    dimension,
  ) as DimensionMetadata | null;
}

export function replaceClause(
  definition: MetricDefinition,
  targetClause: Clause,
  newClause: Clause,
): MetricDefinition {
  // Unjustified type cast. FIXME
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
  // Unjustified type cast. FIXME
  return LibMetric.removeClause(definition, clause) as MetricDefinition;
}

export function swapClauses(
  definition: MetricDefinition,
  sourceClause: Clause,
  targetClause: Clause,
): MetricDefinition {
  // Unjustified type cast. FIXME
  return LibMetric.swapClauses(
    definition,
    sourceClause,
    targetClause,
  ) as MetricDefinition;
}

export function temporalBucket(
  projection: Clause | DimensionMetadata,
): TemporalBucket | null {
  // Unjustified type cast. FIXME
  return LibMetric.temporalBucket(projection) as TemporalBucket | null;
}

export function availableTemporalBuckets(
  definition: MetricDefinition,
  dimension: DimensionMetadata,
): TemporalBucket[] {
  // Unjustified type cast. FIXME
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
  projection: Clause | DimensionMetadata,
  bucket: TemporalBucket | null,
): ProjectionClause {
  // Unjustified type cast. FIXME
  return LibMetric.withTemporalBucket(projection, bucket) as ProjectionClause;
}

export function withDefaultTemporalBucket(
  definition: MetricDefinition,
  projection: ProjectionClause,
): ProjectionClause {
  const dimension = projectionDimension(definition, projection);
  if (!dimension) {
    return projection;
  }
  const bucket = defaultTemporalBucket(definition, dimension);
  return bucket ? withTemporalBucket(projection, bucket) : projection;
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
  projection: Clause | DimensionMetadata,
): BinningStrategy | null {
  // Unjustified type cast. FIXME
  return LibMetric.binning(projection) as BinningStrategy | null;
}

export function availableBinningStrategies(
  definition: MetricDefinition,
  dimension: DimensionMetadata,
): BinningStrategy[] {
  // Unjustified type cast. FIXME
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
  projection: Clause | DimensionMetadata,
  binningStrategy: BinningStrategy | null,
): ProjectionClause {
  // Unjustified type cast. FIXME
  return LibMetric.withBinning(projection, binningStrategy) as ProjectionClause;
}

export function withDefaultBinning(
  definition: MetricDefinition,
  projection: ProjectionClause,
): ProjectionClause {
  const dimension = projectionDimension(definition, projection);
  if (!dimension) {
    return projection;
  }
  const strategies = availableBinningStrategies(definition, dimension);
  const defaultStrategy = strategies.find(
    (strategy) => displayInfo(definition, strategy).default,
  );
  return defaultStrategy
    ? withBinning(projection, defaultStrategy)
    : projection;
}

type TypeFn = (dimension: DimensionMetadata) => boolean;

export const isBoolean: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isBoolean(dimension) as boolean;
};

export const isCoordinate: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isCoordinate(dimension) as boolean;
};

export const isTemporal: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isTemporal(dimension) as boolean;
};

export const isDateOrDateTime: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isDateOrDateTime(dimension) as boolean;
};

export const isForeignKey: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isForeignKey(dimension) as boolean;
};

export const isLocation: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isLocation(dimension) as boolean;
};

export const isLatitude: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isLatitude(dimension) as boolean;
};

export const isLongitude: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isLongitude(dimension) as boolean;
};

export const isNumeric: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isNumeric(dimension) as boolean;
};

export const isPrimaryKey: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isPrimaryKey(dimension) as boolean;
};

export const isStringLike: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isStringLike(dimension) as boolean;
};

export const isStringOrStringLike: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isStringOrStringLike(dimension) as boolean;
};

export const isTime: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isTime(dimension) as boolean;
};

export const isCategory: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isCategory(dimension) as boolean;
};

export const isID: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isID(dimension) as boolean;
};

export const isURL: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isURL(dimension) as boolean;
};

export const isEntityName: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isEntityName(dimension) as boolean;
};

export const isTitle: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isTitle(dimension) as boolean;
};

export const isState: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isState(dimension) as boolean;
};

export const isCountry: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isCountry(dimension) as boolean;
};

export const isCity: TypeFn = (dimension) => {
  // Unjustified type cast. FIXME
  return LibMetric.isCity(dimension) as boolean;
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
  segment: SegmentMetadata,
): SegmentDisplayInfo;
export function displayInfo(
  definition: MetricDefinition,
  filterParts: Displayable,
): DisplayInfo;
export function displayInfo(
  definition: MetricDefinition,
  source: Displayable,
): DisplayInfo {
  // Unjustified type cast. FIXME
  return LibMetric.displayInfo(definition, source) as DisplayInfo;
}

export function dimensionValuesInfo(
  definition: MetricDefinition,
  dimension: DimensionMetadata,
): DimensionValuesInfo {
  // Unjustified type cast. FIXME
  return LibMetric.dimensionValuesInfo(
    definition,
    dimension,
  ) as DimensionValuesInfo;
}

export function isSameSource(
  dimension1: DimensionMetadata,
  dimension2: DimensionMetadata,
): boolean {
  // Unjustified type cast. FIXME
  return LibMetric.isSameSource(dimension1, dimension2) as boolean;
}

export function isCompatibleType(
  dimension1: DimensionMetadata,
  dimension2: DimensionMetadata,
): boolean {
  // Unjustified type cast. FIXME
  return LibMetric.isCompatibleType(dimension1, dimension2) as boolean;
}
