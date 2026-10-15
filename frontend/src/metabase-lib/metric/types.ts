import type {
  Metabase_LibMetric_Schema_Binning,
  Metabase_LibMetric_Schema_BinningOption,
  Metabase_LibMetric_Schema_DimensionReference,
  Metabase_LibMetric_Schema_MetadataDimension,
  Metabase_LibMetric_Schema_MetricDefinition,
  Metabase_LibMetric_Schema_SourceInstanceJs,
  Metabase_Lib_Schema_MbqlClause_Clause,
  Metabase_Lib_Schema_Metadata_Measure,
  Metabase_Lib_Schema_Metadata_Metric,
  Metabase_Lib_Schema_Metadata_Segment,
  Metabase_Lib_Schema_TemporalBucketing_Option,
} from "cljs/metabase.lib.shared";
import type * as LibMetric from "cljs/metabase.lib_metric.js";
import type { DimensionId, TemporalUnit } from "metabase-types/api";

declare const _MetadataProviderSymbol: unique symbol;

export type MetadataProvider = unknown & {
  _opaque: typeof _MetadataProviderSymbol;
};

export type MetricMetadata = Metabase_Lib_Schema_Metadata_Metric;

export type MeasureMetadata = Metabase_Lib_Schema_Metadata_Measure;

export type MetricDefinition = Metabase_LibMetric_Schema_MetricDefinition;

export type DimensionMetadata = Metabase_LibMetric_Schema_MetadataDimension;

export type FilterClause = Metabase_Lib_Schema_MbqlClause_Clause;

export type ProjectionClause = Metabase_LibMetric_Schema_DimensionReference;

export type TemporalBucket = Metabase_Lib_Schema_TemporalBucketing_Option;

export type BinningStrategy =
  | Metabase_LibMetric_Schema_Binning
  | Metabase_LibMetric_Schema_BinningOption;

export type SourceInstance = Metabase_LibMetric_Schema_SourceInstanceJs;

export type SegmentMetadata = Metabase_Lib_Schema_Metadata_Segment;

export type SegmentDisplayInfo = {
  name?: string;
  displayName: string;
  longDisplayName?: string;
  description?: string;
  filterPositions?: number[];
  group?: DimensionGroup;
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
  | BinningStrategy
  | SegmentMetadata;

export type DisplayInfo =
  | MetricDisplayInfo
  | MeasureDisplayInfo
  | ClauseDisplayInfo
  | DimensionDisplayInfo
  | TemporalBucketDisplayInfo
  | BinningStrategyDisplayInfo
  | SegmentDisplayInfo;

export type FilterParts = NonNullable<
  | ReturnType<typeof LibMetric.stringFilterParts>
  | ReturnType<typeof LibMetric.numberFilterParts>
  | ReturnType<typeof LibMetric.coordinateFilterParts>
  | ReturnType<typeof LibMetric.booleanFilterParts>
  | SpecificDateFilterPartsOutput
  | ReturnType<typeof LibMetric.relativeDateFilterParts>
  | ReturnType<typeof LibMetric.excludeDateFilterParts>
  | TimeFilterPartsOutput
  | ReturnType<typeof LibMetric.defaultFilterParts>
>;

type DateValuesFilterParts<Parts> = Omit<NonNullable<Parts>, "values"> & {
  values: Date[];
};

export type SpecificDateFilterPartsOutput = DateValuesFilterParts<
  ReturnType<typeof LibMetric.specificDateFilterParts>
>;

export type TimeFilterPartsOutput = DateValuesFilterParts<
  ReturnType<typeof LibMetric.timeFilterParts>
>;

type DimensionFilterParts<Parts> = Parts & { dimension: DimensionMetadata };

export type StringFilterParts = DimensionFilterParts<
  Parameters<typeof LibMetric.stringFilterClause>[0]
>;

export type NumberFilterParts = DimensionFilterParts<
  Parameters<typeof LibMetric.numberFilterClause>[0]
>;

export type CoordinateFilterParts = DimensionFilterParts<
  Parameters<typeof LibMetric.coordinateFilterClause>[0]
> & { longitudeDimension: DimensionMetadata | null };

export type BooleanFilterParts = DimensionFilterParts<
  Parameters<typeof LibMetric.booleanFilterClause>[0]
>;

export type SpecificDateFilterParts = DimensionFilterParts<
  Omit<Parameters<typeof LibMetric.specificDateFilterClause>[0], "values">
> & { values: Date[] };

export type RelativeDateFilterParts = DimensionFilterParts<
  Parameters<typeof LibMetric.relativeDateFilterClause>[0]
>;

export type ExcludeDateFilterParts = DimensionFilterParts<
  Parameters<typeof LibMetric.excludeDateFilterClause>[0]
>;

export type TimeFilterParts = DimensionFilterParts<
  Omit<Parameters<typeof LibMetric.timeFilterClause>[0], "values">
> & { values: Date[] };

export type DefaultFilterParts = DimensionFilterParts<
  Parameters<typeof LibMetric.defaultFilterClause>[0]
>;

export type DimensionValuesInfo = {
  id: DimensionId;
  canListValues: boolean;
  canSearchValues: boolean;
  canRemapValues: boolean;
};
