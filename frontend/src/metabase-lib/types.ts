import type { DatasetColumn, RowValue } from "metabase-types/api";
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
} from "./constants";

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
export type MetricMetadata = unknown & { _opaque: typeof MetricMetadata };

declare const AggregationClause: unique symbol;
export type AggregationClause = unknown & { _opaque: typeof AggregationClause };

export type Aggregable = AggregationClause | MetricMetadata;

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

export type Limit = number | null;

declare const ColumnMetadata: unique symbol;
export type ColumnMetadata = unknown & { _opaque: typeof ColumnMetadata };

declare const ColumnGroup: unique symbol;
export type ColumnGroup = unknown & { _opaque: typeof ColumnGroup };

declare const Bucket: unique symbol;
export type Bucket = unknown & { _opaque: typeof Bucket };

export type BucketName =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "quarter"
  | "month"
  | "year"
  | "day-of-week"
  | "month-of-year"
  | "quarter-of-year"
  | "hour-of-day";

export type BucketDisplayInfo = {
  shortName: BucketName;
  displayName: string;
  default?: boolean;
  selected?: boolean;
};

export type TableDisplayInfo = {
  name: string;
  displayName: string;
  isSourceTable: boolean;
  isFromJoin: boolean;
  isImplicitlyJoinable: boolean;
};

export type CardDisplayInfo = TableDisplayInfo;

type TableInlineDisplayInfo = Pick<
  TableDisplayInfo,
  "name" | "displayName" | "isSourceTable"
>;

export type ColumnDisplayInfo = {
  name: string;
  displayName: string;
  longDisplayName: string;

  isCalculated: boolean;
  isFromJoin: boolean;
  isImplicitlyJoinable: boolean;
  table?: TableInlineDisplayInfo;

  breakoutPosition?: number;
  filterPositions?: number[];
  orderByPosition?: number;
  selected?: boolean; // used in aggregation and field clauses
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
  selected?: boolean;
};

export type ClauseDisplayInfo = Pick<
  ColumnDisplayInfo,
  "name" | "displayName" | "longDisplayName" | "table"
> & {
  isNamed?: boolean;
};

export type AggregationClauseDisplayInfo = ClauseDisplayInfo;

export type BreakoutClauseDisplayInfo = ClauseDisplayInfo;

export type OrderByClauseDisplayInfo = ClauseDisplayInfo & {
  direction: OrderByDirection;
};

export type ExpressionOperatorName =
  | "+"
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
  | "relative-datetime"
  | "inside"
  | "segment";

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
  | BooleanFilterParts
  | SpecificDateFilterParts
  | RelativeDateFilterParts
  | ExcludeDateFilterParts
  | TimeFilterParts
  | CoordinateFilterParts;

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
  | "drill-thru/quick-filter"
  | "drill-thru/pk"
  | "drill-thru/zoom"
  | "drill-thru/fk-details"
  | "drill-thru/pivot"
  | "drill-thru/fk-filter"
  | "drill-thru/distribution"
  | "drill-thru/sort"
  | "drill-thru/summarize-column"
  | "drill-thru/summarize-column-by-time"
  | "drill-thru/column-filter"
  | "drill-thru/underlying-records"
  | "drill-thru/zoom-in.timeseries";

export type BaseDrillThruInfo<Type extends DrillThruType> = { type: Type };

export type QuickFilterDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/quick-filter"> & {
    operators: Array<"=" | "≠" | "<" | ">">;
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

export type SortDrillThruInfo = BaseDrillThruInfo<"drill-thru/sort"> & {
  directions: Array<"asc" | "desc">;
};

export type SummarizeColumnDrillAggregationOperator =
  | "sum"
  | "avg"
  | "distinct";

export type SummarizeColumnDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/summarize-column"> & {
    aggregations: Array<SummarizeColumnDrillAggregationOperator>;
  };
export type SummarizeColumnByTimeDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/summarize-column-by-time">;

export type ColumnFilterDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/column-filter"> & {
    initialOp: { short: string } | null; // null gets returned for date column
  };

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
  stageNumber: number;
  column: ColumnMetadata;
};

export interface Dimension {
  column: DatasetColumn;
  value?: RowValue;
}

export type DataRow = Array<{
  col: DatasetColumn | ColumnMetadata | null;
  value: RowValue;
}>;
