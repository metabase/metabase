import type {
  CardId,
  DatasetColumn,
  DatabaseId,
  FieldId,
  FieldValuesType,
  RowValue,
  TableId,
  SchemaId,
  TemporalUnit,
} from "metabase-types/api";

import type {
  BOOLEAN_FILTER_OPERATORS,
  COORDINATE_FILTER_OPERATORS,
  NUMBER_FILTER_OPERATORS,
  STRING_FILTER_OPERATORS,
  EXCLUDE_DATE_BUCKETS,
  EXCLUDE_DATE_FILTER_OPERATORS,
  SPECIFIC_DATE_FILTER_OPERATORS,
  RELATIVE_DATE_BUCKETS,
  TIME_FILTER_OPERATORS,
  DEFAULT_FILTER_OPERATORS,
} from "./constants";
import type { ColumnExtractionTag } from "./extractions";

/**
 * An "opaque type": this technique gives us a way to pass around opaque CLJS values that TS will track for us,
 * and in other files it gets treated like `unknown` so it can't be examined, manipulated or a new one created.
 */
declare const Query: unique symbol;
export type Query = unknown & { _opaque: typeof Query };

declare const MetadataProvider: unique symbol;
export type MetadataProvider = unknown & { _opaque: typeof MetadataProvider };

declare const TableMetadata: unique symbol;
export type TableMetadata = unknown & { _opaque: typeof TableMetadata };

declare const CardMetadata: unique symbol;
export type CardMetadata = unknown & { _opaque: typeof CardMetadata };

declare const SegmentMetadata: unique symbol;
export type SegmentMetadata = unknown & { _opaque: typeof SegmentMetadata };

declare const MetricMetadata: unique symbol;
export type MetricMetadata = unknown & {
  _opaque: typeof MetricMetadata;
};

declare const AggregationClause: unique symbol;
export type AggregationClause = unknown & { _opaque: typeof AggregationClause };

export type Aggregable = AggregationClause | MetricMetadata | ExpressionClause;

declare const AggregationOperator: unique symbol;
export type AggregationOperator = unknown & {
  _opaque: typeof AggregationOperator;
};

declare const BreakoutClause: unique symbol;
export type BreakoutClause = unknown & { _opaque: typeof BreakoutClause };

declare const ExpressionClause: unique symbol;
export type ExpressionClause = unknown & { _opaque: typeof ExpressionClause };

declare const OrderByClause: unique symbol;
export type OrderByClause = unknown & { _opaque: typeof OrderByClause };

export type OrderByDirection = "asc" | "desc";

declare const FilterClause: unique symbol;
export type FilterClause = unknown & { _opaque: typeof FilterClause };

export type Filterable = FilterClause | ExpressionClause | SegmentMetadata;

declare const Join: unique symbol;
export type Join = unknown & { _opaque: typeof Join };

declare const JoinStrategy: unique symbol;
export type JoinStrategy = unknown & { _opaque: typeof JoinStrategy };

declare const JoinCondition: unique symbol;
export type JoinCondition = unknown & { _opaque: typeof JoinCondition };

declare const JoinConditionOperator: unique symbol;
export type JoinConditionOperator = unknown & {
  _opaque: typeof JoinConditionOperator;
};

export type Clause =
  | AggregationClause
  | BreakoutClause
  | ExpressionClause
  | FilterClause
  | JoinCondition
  | OrderByClause;

export type ClauseType =
  | "data"
  | "joins"
  | "expressions"
  | "filters"
  | "aggregation"
  | "breakout"
  | "order-by"
  | "limit";

export type Limit = number | null;

declare const ColumnMetadata: unique symbol;
export type ColumnMetadata = unknown & { _opaque: typeof ColumnMetadata };

declare const ColumnGroup: unique symbol;
export type ColumnGroup = unknown & { _opaque: typeof ColumnGroup };

declare const Bucket: unique symbol;
export type Bucket = unknown & { _opaque: typeof Bucket };

export type BucketDisplayInfo = {
  shortName: TemporalUnit;
  displayName: string;
  default?: boolean;
  selected?: boolean;
  isTemporalExtraction?: boolean;
};

export type TableDisplayInfo = {
  name: string;
  displayName: string;
  isSourceTable: boolean;
  isFromJoin: boolean;
  isImplicitlyJoinable: boolean;
  schema: SchemaId;
  isQuestion?: boolean;
  isModel?: boolean;
  isMetric?: boolean;
};

export type CardDisplayInfo = TableDisplayInfo;

type TableInlineDisplayInfo = Pick<
  TableDisplayInfo,
  "name" | "displayName" | "isSourceTable"
>;

export type ColumnDisplayInfo = {
  name: string;
  description?: string;
  displayName: string;
  longDisplayName: string;
  semanticType: string | null;
  effectiveType: string;

  isCalculated: boolean;
  isFromJoin: boolean;
  isImplicitlyJoinable: boolean;
  isAggregation: boolean;
  isBreakout: boolean;
  table?: TableInlineDisplayInfo;
  fingerprint?: FingerprintDisplayInfo;

  breakoutPosition?: number;
  filterPositions?: number[];
  orderByPosition?: number;
  selected?: boolean; // used in aggregation and field clauses
};

export type FingerprintDisplayInfo = {
  global?: FingerprintGlobalDisplayInfo;
  type?: FingerprintTypeDisplayInfo;
};

export type FingerprintGlobalDisplayInfo = {
  distinctCount?: number;
  "nil%"?: number;
};

export type FingerprintTypeDisplayInfo = {
  "type/Text"?: TextFingerprintDisplayInfo;
  "type/Number"?: NumberFingerprintDisplayInfo;
  "type/DateTime"?: DateTimeFingerprintDisplayInfo;
};

export type TextFingerprintDisplayInfo = {
  averageLength: number;
  percentEmail: number;
  percentJson: number;
  percentState: number;
  percentUrl: number;
};

// We're setting the values here as unknown even though
// the API will return numbers most of the time, because
// sometimes it doesn't!
export type NumberFingerprintDisplayInfo = {
  avg: unknown;
  max: unknown;
  min: unknown;
  q1: unknown;
  q3: unknown;
  sd: unknown;
};

export type DateTimeFingerprintDisplayInfo = {
  earliest: string;
  latest: string;
};

export type ColumnGroupDisplayInfo = TableDisplayInfo & {
  fkReferenceName?: string;
};

export type SegmentDisplayInfo = {
  name: string;
  displayName: string;
  longDisplayName: string;
  description: string;
  filterPositions?: number[];
  effectiveType?: string;
};

export type AggregationOperatorDisplayInfo = {
  columnName: string;
  displayName: string;
  description: string;
  shortName: string;
  requiresColumn: boolean;

  selected?: boolean;
};

export type MetricDisplayInfo = {
  name: string;
  displayName: string;
  longDisplayName: string;
  description: string;
  aggregationPosition?: number;
};

export type ClauseDisplayInfo = Pick<
  ColumnDisplayInfo,
  "name" | "displayName" | "longDisplayName" | "table"
> & {
  isNamed?: boolean;
};

export type AggregationClauseDisplayInfo = ClauseDisplayInfo;

export type BreakoutClauseDisplayInfo = ClauseDisplayInfo & {
  isTemporalExtraction?: boolean;
};

export type OrderByClauseDisplayInfo = ClauseDisplayInfo & {
  direction: OrderByDirection;
};

export type ExpressionOperatorName =
  | "+"
  | "-"
  | "*"
  | "/"
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "between"
  | "contains"
  | "does-not-contain"
  | "is-null"
  | "not-null"
  | "is-empty"
  | "not-empty"
  | "starts-with"
  | "ends-with"
  | "concat"
  | "interval"
  | "time-interval"
  | "relative-time-interval"
  | "relative-datetime"
  | "inside"
  | "segment"
  | "offset";

export type ExpressionArg = null | boolean | number | string | ColumnMetadata;

export type ExpressionParts = {
  operator: ExpressionOperatorName;
  args: (ExpressionArg | ExpressionParts)[];
  options: ExpressionOptions;
};

export type ExpressionOptions = {
  "case-sensitive"?: boolean;
  "include-current"?: boolean;
};

declare const FilterOperator: unique symbol;
export type FilterOperator = unknown & { _opaque: typeof FilterOperator };

export type FilterOperatorName =
  | StringFilterOperatorName
  | NumberFilterOperatorName
  | BooleanFilterOperatorName
  | SpecificDateFilterOperatorName
  | ExcludeDateFilterOperatorName
  | CoordinateFilterOperatorName;

export type StringFilterOperatorName = typeof STRING_FILTER_OPERATORS[number];

export type NumberFilterOperatorName = typeof NUMBER_FILTER_OPERATORS[number];

export type CoordinateFilterOperatorName =
  typeof COORDINATE_FILTER_OPERATORS[number];

export type BooleanFilterOperatorName = typeof BOOLEAN_FILTER_OPERATORS[number];

export type SpecificDateFilterOperatorName =
  typeof SPECIFIC_DATE_FILTER_OPERATORS[number];

export type ExcludeDateFilterOperatorName =
  typeof EXCLUDE_DATE_FILTER_OPERATORS[number];

export type TimeFilterOperatorName = typeof TIME_FILTER_OPERATORS[number];

export type DefaultFilterOperatorName = typeof DEFAULT_FILTER_OPERATORS[number];

export type RelativeDateBucketName = typeof RELATIVE_DATE_BUCKETS[number];

export type ExcludeDateBucketName = typeof EXCLUDE_DATE_BUCKETS[number];

export type FilterOperatorDisplayInfo = {
  shortName: FilterOperatorName;
  displayName: string;
  longDisplayName: string;
  default?: boolean;
};

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
  operator: StringFilterOperatorName;
  column: ColumnMetadata;
  values: string[];
  options: StringFilterOptions;
};

export type StringFilterOptions = {
  "case-sensitive"?: boolean;
};

export type NumberFilterParts = {
  operator: NumberFilterOperatorName;
  column: ColumnMetadata;
  values: number[];
};

export type CoordinateFilterParts = {
  operator: CoordinateFilterOperatorName;
  column: ColumnMetadata;
  longitudeColumn?: ColumnMetadata;
  values: number[];
};

export type BooleanFilterParts = {
  operator: BooleanFilterOperatorName;
  column: ColumnMetadata;
  values: boolean[];
};

export type SpecificDateFilterParts = {
  operator: SpecificDateFilterOperatorName;
  column: ColumnMetadata;
  values: Date[];
  hasTime: boolean;
};

export type RelativeDateFilterParts = {
  column: ColumnMetadata;
  bucket: RelativeDateBucketName;
  value: number | "current";
  offsetBucket: RelativeDateBucketName | null;
  offsetValue: number | null;
  options: RelativeDateFilterOptions;
};

export type RelativeDateFilterOptions = {
  "include-current"?: boolean;
};

/*
 * values depend on the bucket
 * day-of-week => 1-7 (Monday-Sunday)
 * month-of-year => 0-11 (January-December)
 * quarter-of-year => 1-4
 * hour-of-day => 0-23
 */
export type ExcludeDateFilterParts = {
  operator: ExcludeDateFilterOperatorName;
  column: ColumnMetadata;
  bucket: ExcludeDateBucketName | null;
  values: number[];
};

export type TimeFilterParts = {
  operator: TimeFilterOperatorName;
  column: ColumnMetadata;
  values: Date[];
};

export type DefaultFilterParts = {
  operator: DefaultFilterOperatorName;
  column: ColumnMetadata;
};

export type JoinConditionOperatorDisplayInfo = {
  displayName: string;
  shortName: string;
  default?: boolean;
};

export type JoinConditionParts = {
  operator: JoinConditionOperator;
  lhsColumn: ColumnMetadata;
  rhsColumn: ColumnMetadata;
};

export type JoinStrategyDisplayInfo = {
  displayName: string;
  default?: boolean;
  shortName: string;
};

declare const DrillThru: unique symbol;
export type DrillThru = unknown & { _opaque: typeof DrillThru };

export type DrillThruType =
  | "drill-thru/automatic-insights"
  | "drill-thru/column-extract"
  | "drill-thru/column-filter"
  | "drill-thru/combine-columns"
  | "drill-thru/compare-aggregations"
  | "drill-thru/distribution"
  | "drill-thru/fk-details"
  | "drill-thru/fk-filter"
  | "drill-thru/pivot"
  | "drill-thru/pk"
  | "drill-thru/quick-filter"
  | "drill-thru/sort"
  | "drill-thru/summarize-column-by-time"
  | "drill-thru/summarize-column"
  | "drill-thru/underlying-records"
  | "drill-thru/zoom"
  | "drill-thru/zoom-in.binning"
  | "drill-thru/zoom-in.geographic"
  | "drill-thru/zoom-in.timeseries";

export type BaseDrillThruInfo<Type extends DrillThruType> = { type: Type };

declare const ColumnExtraction: unique symbol;
export type ColumnExtraction = unknown & {
  _opaque: typeof ColumnExtraction;
};

export type ColumnExtractionInfo = {
  tag: ColumnExtractionTag;
  displayName: string;
};

export type ColumnExtractDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/column-extract"> & {
    displayName: string;
    extractions: ColumnExtractionInfo[];
  };

export type CompareAggregationsDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/compare-aggregations">;

export type CombineColumnsDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/combine-columns">;

export type QuickFilterDrillThruOperator =
  | "="
  | "≠"
  | "<"
  | ">"
  | "contains"
  | "does-not-contain";

export type QuickFilterDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/quick-filter"> & {
    value: unknown;
    operators: Array<QuickFilterDrillThruOperator>;
  };

type ObjectDetailsDrillThruInfo<Type extends DrillThruType> =
  BaseDrillThruInfo<Type> & {
    objectId: string | number;
    isManyPks: boolean;
  };
export type PKDrillThruInfo = ObjectDetailsDrillThruInfo<"drill-thru/pk">;
export type ZoomDrillThruInfo = ObjectDetailsDrillThruInfo<"drill-thru/zoom">;
export type FKDetailsDrillThruInfo =
  ObjectDetailsDrillThruInfo<"drill-thru/fk-details">;

export type PivotDrillThruInfo = BaseDrillThruInfo<"drill-thru/pivot">;

export type FKFilterDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/fk-filter"> & {
    tableName: string;
    columnName: string;
  };
export type DistributionDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/distribution">;

export type SortDrillThruDirection = "asc" | "desc";

export type SortDrillThruInfo = BaseDrillThruInfo<"drill-thru/sort"> & {
  directions: Array<SortDrillThruDirection>;
};

export type SummarizeColumnDrillThruOperator = "sum" | "avg" | "distinct";

export type SummarizeColumnDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/summarize-column"> & {
    aggregations: Array<SummarizeColumnDrillThruOperator>;
  };
export type SummarizeColumnByTimeDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/summarize-column-by-time">;

export type ColumnFilterDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/column-filter">;

export type UnderlyingRecordsDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/underlying-records"> & {
    rowCount: number;
    tableName: string;
  };

export type ZoomTimeseriesDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/zoom-in.timeseries"> & {
    displayName?: string;
  };

export type DrillThruDisplayInfo =
  | ColumnExtractDrillThruInfo
  | CombineColumnsDrillThruInfo
  | CompareAggregationsDrillThruInfo
  | QuickFilterDrillThruInfo
  | PKDrillThruInfo
  | ZoomDrillThruInfo
  | FKDetailsDrillThruInfo
  | PivotDrillThruInfo
  | FKFilterDrillThruInfo
  | DistributionDrillThruInfo
  | SortDrillThruInfo
  | SummarizeColumnDrillThruInfo
  | SummarizeColumnByTimeDrillThruInfo
  | ColumnFilterDrillThruInfo
  | UnderlyingRecordsDrillThruInfo
  | ZoomTimeseriesDrillThruInfo;

export type FilterDrillDetails = {
  query: Query;
  stageIndex: number;
  column: ColumnMetadata;
};

export type AggregationDrillDetails = {
  aggregation: AggregationClause;
};

export type PivotType = "category" | "location" | "time";

export interface ClickObjectDimension {
  value: RowValue;
  column: DatasetColumn;
}

export interface ClickObjectDataRow {
  col: DatasetColumn | null; // can be null for custom columns
  value: RowValue;
}

export interface ClickObject {
  value?: RowValue;
  column?: DatasetColumn;
  dimensions?: ClickObjectDimension[];
  event?: MouseEvent;
  element?: Element;
  seriesIndex?: number;
  cardId?: CardId;
  settings?: Record<string, unknown>;
  columnShortcuts?: boolean;
  origin?: {
    row: RowValue;
    cols: DatasetColumn[];
  };
  extraData?: Record<string, unknown>;
  data?: ClickObjectDataRow[];
}

export interface FieldValuesSearchInfo {
  fieldId: FieldId | null;
  searchFieldId: FieldId | null;
  hasFieldValues: FieldValuesType;
}

export type QueryDisplayInfo = {
  isNative: boolean;
  isEditable: boolean;
};

export type DatabaseItem = {
  type: "database";
  id: DatabaseId;
};

export type SchemaItem = {
  type: "schema";
  id: DatabaseId;
};

export type TableItem = {
  type: "table";
  id: TableId;
};

export type FieldItem = {
  type: "field";
  id: FieldId;
};

export type DependentItem = DatabaseItem | SchemaItem | TableItem | FieldItem;
