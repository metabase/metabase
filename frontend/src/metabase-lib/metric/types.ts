import type {
  Metabase_LibMetric_Schema_Binning,
  Metabase_LibMetric_Schema_DimensionReference,
  Metabase_LibMetric_Schema_MetadataDimension,
  Metabase_LibMetric_Schema_MetricDefinition,
  Metabase_Lib_Metadata_Protocols_MetadataProvider,
  Metabase_Lib_Schema_MbqlClause_Clause,
  Metabase_Lib_Schema_Metadata_Measure,
  Metabase_Lib_Schema_Metadata_Metric,
  Metabase_Lib_Schema_TemporalBucketing_Option,
} from "cljs/metabase.lib.shared";
import type { DimensionId, TemporalUnit } from "metabase-types/api";

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

declare const _SourceInstanceSymbol: unique symbol;

export type MetadataProvider = Metabase_Lib_Metadata_Protocols_MetadataProvider;

export type MetricMetadata = Metabase_Lib_Schema_Metadata_Metric;

export type MeasureMetadata = Metabase_Lib_Schema_Metadata_Measure;

export type MetricDefinition = Metabase_LibMetric_Schema_MetricDefinition;

export type DimensionMetadata = Metabase_LibMetric_Schema_MetadataDimension;

export type FilterClause = Metabase_Lib_Schema_MbqlClause_Clause;

export type ProjectionClause = Metabase_LibMetric_Schema_DimensionReference;

export type TemporalBucket = Metabase_Lib_Schema_TemporalBucketing_Option;

export type BinningStrategy = Metabase_LibMetric_Schema_Binning;

export type SourceInstance = unknown & {
  _opaque: typeof _SourceInstanceSymbol;
};

export type MetadataProviderable = MetadataProvider | MetricDefinition;

export type Clause = FilterClause | ProjectionClause;

export type MetricDisplayInfo = {
  displayName: string;
  columnName?: string;
};

export type MeasureDisplayInfo = {
  displayName: string;
  columnName?: string;
};

export type ClauseDisplayInfo = {
  displayName: string;
};

export type DimensionGroup = {
  id: string;
  type: "main" | "connection";
  displayName: string;
};

export type DimensionDisplayInfo = {
  name?: string;
  displayName: string;
  longDisplayName: string;
  group?: DimensionGroup;
  isFromJoin?: boolean;
  isImplicitlyJoinable?: boolean;
  filterPositions?: number[];
  projectionPositions?: number[];
};

export type TemporalBucketDisplayInfo = {
  shortName: TemporalUnit;
  displayName: string;
  default?: boolean;
  selected?: boolean;
  isTemporalExtraction?: boolean;
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
