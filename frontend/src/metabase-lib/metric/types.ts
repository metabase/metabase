import type {
  DimensionId,
  MeasureId,
  MetricId,
  NormalizedMeasure,
  NormalizedMetric,
  TemporalUnit,
} from "metabase-types/api";

import type {
  BooleanFilterOperator,
  CoordinateFilterOperator,
  DefaultFilterOperator,
  ExcludeDateFilterOperator,
  ExcludeDateFilterUnit,
  NumberFilterOperator,
  NumberFilterValue,
  RelativeDateFilterOptions,
  RelativeDateFilterUnit,
  SpecificDateFilterOperator,
  StringFilterOperator,
  StringFilterOptions,
  TimeFilterOperator,
} from "../common";

declare const _MetadataProviderSymbol: unique symbol;
declare const _MetricMetadataSymbol: unique symbol;
declare const _MeasureMetadataSymbol: unique symbol;
declare const _MetricDefinitionSymbol: unique symbol;
declare const _DimensionMetadataSymbol: unique symbol;
declare const _FilterClauseSymbol: unique symbol;
declare const _ProjectionClauseSymbol: unique symbol;
declare const _TemporalBucketSymbol: unique symbol;
declare const _BinningStrategySymbol: unique symbol;

export type MetadataProvider = unknown & {
  _opaque: typeof _MetadataProviderSymbol;
};

export type MetricMetadata = unknown & {
  _opaque: typeof _MetricMetadataSymbol;
};

export type MeasureMetadata = unknown & {
  _opaque: typeof _MeasureMetadataSymbol;
};

export type MetricDefinition = unknown & {
  _opaque: typeof _MetricDefinitionSymbol;
};

export type DimensionMetadata = unknown & {
  _opaque: typeof _DimensionMetadataSymbol;
};

export type FilterClause = unknown & {
  _opaque: typeof _FilterClauseSymbol;
};

export type ProjectionClause = unknown & {
  _opaque: typeof _ProjectionClauseSymbol;
};

export type TemporalBucket = unknown & {
  _opaque: typeof _TemporalBucketSymbol;
};

export type BinningStrategy = unknown & {
  _opaque: typeof _BinningStrategySymbol;
};

export type MetadataProviderable = MetadataProvider | MetricDefinition;

export type JsMetadataProvider = {
  measures?: Record<MeasureId, NormalizedMeasure>;
  metrics?: Record<MetricId, NormalizedMetric>;
};

export type Clause = FilterClause | ProjectionClause;

export type MetricDisplayInfo = {
  displayName: string;
};

export type MeasureDisplayInfo = {
  displayName: string;
};

export type ClauseDisplayInfo = {
  displayName: string;
};

export type DimensionDisplayInfo = {
  displayName: string;
  filterPositions?: number[];
  projectionPositions?: number[];
};

export type TemporalBucketDisplayInfo = {
  shortName: TemporalUnit;
  displayName: string;
  default?: boolean;
  selected?: boolean;
};

export type BinningStrategyDisplayInfo = {
  displayName: string;
  default?: boolean;
  selected?: boolean;
};

export type Displayable =
  | MetricMetadata
  | MeasureMetadata
  | Clause
  | DimensionMetadata
  | TemporalBucket
  | BinningStrategy;

export type DisplayInfo =
  | MetricDisplayInfo
  | MeasureDisplayInfo
  | ClauseDisplayInfo
  | DimensionDisplayInfo
  | TemporalBucketDisplayInfo
  | BinningStrategyDisplayInfo;

export type FilterParts =
  | StringFilterParts
  | NumberFilterParts
  | CoordinateFilterParts
  | BooleanFilterParts
  | SpecificDateFilterParts
  | RelativeDateFilterParts
  | ExcludeDateFilterParts
  | TimeFilterParts
  | DefaultFilterParts;

export type StringFilterParts = {
  operator: StringFilterOperator;
  dimension: DimensionMetadata;
  values: string[];
  options: StringFilterOptions;
};

export type NumberFilterParts = {
  operator: NumberFilterOperator;
  dimension: DimensionMetadata;
  values: NumberFilterValue[];
};

export type CoordinateFilterParts = {
  operator: CoordinateFilterOperator;
  dimension: DimensionMetadata;
  longitudeDimension: DimensionMetadata | null;
  values: NumberFilterValue[];
};

export type BooleanFilterParts = {
  operator: BooleanFilterOperator;
  dimension: DimensionMetadata;
  values: boolean[];
};

export type SpecificDateFilterParts = {
  operator: SpecificDateFilterOperator;
  dimension: DimensionMetadata;
  values: Date[];
  hasTime: boolean;
};

export type RelativeDateFilterParts = {
  dimension: DimensionMetadata;
  unit: RelativeDateFilterUnit;
  value: number;
  offsetUnit: RelativeDateFilterUnit | null;
  offsetValue: number | null;
  options: RelativeDateFilterOptions;
};

export type ExcludeDateFilterParts = {
  operator: ExcludeDateFilterOperator;
  dimension: DimensionMetadata;
  unit: ExcludeDateFilterUnit | null;
  values: number[];
};

export type TimeFilterParts = {
  operator: TimeFilterOperator;
  dimension: DimensionMetadata;
  values: Date[];
};

export type DefaultFilterParts = {
  operator: DefaultFilterOperator;
  dimension: DimensionMetadata;
};

export type DimensionValuesInfo = {
  id: DimensionId;
  canListValues: boolean;
  canSearchValues: boolean;
  canRemapValues: boolean;
};
