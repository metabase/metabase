import type { DatasetColumn, RowValue } from "metabase-types/api";
import type {
  BOOLEAN_FILTER_OPERATORS,
  EXCLUDE_DATE_FILTER_OPERATORS,
  NUMBER_FILTER_OPERATORS,
  SPECIFIC_DATE_FILTER_OPERATORS,
  STRING_FILTER_OPERATORS,
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

export type Aggregatable = AggregationClause | MetricMetadata;

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

export type Clause =
  | AggregationClause
  | BreakoutClause
  | ExpressionClause
  | FilterClause
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

type TableInlineDisplayInfo = Pick<
  TableDisplayInfo,
  "name" | "displayName" | "isSourceTable"
>;

export type ColumnDisplayInfo = {
  name: string;
  displayName: string;
  longDisplayName: string;

  fkReferenceName?: string;
  isCalculated: boolean;
  isFromJoin: boolean;
  isImplicitlyJoinable: boolean;
  table?: TableInlineDisplayInfo;

  breakoutPosition?: number;
  orderByPosition?: number;
  selected?: boolean; // used in aggregation and field clauses
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
>;

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
  | "interval"
  | "time-interval"
  | "relative-datetime";

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
  | ExcludeDateFilterOperatorName
  | TimeFilterOperatorName;

export type FilterOperatorDisplayInfo = {
  shortName: FilterOperatorName;
  displayName: string;
  default?: boolean;
};

export type FilterParts =
  | StringFilterParts
  | NumberFilterParts
  | BooleanFilterParts
  | SpecificDateFilterParts
  | RelativeDateFilterParts
  | ExcludeDateFilterParts
  | TimeFilterParts;

export type StringFilterOperatorName = typeof STRING_FILTER_OPERATORS[number];

export type StringFilterParts = {
  operator: StringFilterOperatorName;
  column: ColumnMetadata;
  values: string[];
  options: StringFilterOptions;
};

export type StringFilterOptions = {
  "case-sensitive"?: boolean;
};

export type NumberFilterOperatorName = typeof NUMBER_FILTER_OPERATORS[number];

export type NumberFilterParts = {
  operator: NumberFilterOperatorName;
  column: ColumnMetadata;
  values: number[];
};

export type BooleanFilterOperatorName = typeof BOOLEAN_FILTER_OPERATORS[number];

export type BooleanFilterParts = {
  operator: BooleanFilterOperatorName;
  column: ColumnMetadata;
  values: boolean[];
};

export type SpecificDateFilterOperatorName =
  typeof SPECIFIC_DATE_FILTER_OPERATORS[number];

export type SpecificDateFilterParts = {
  operator: SpecificDateFilterOperatorName;
  column: ColumnMetadata;
  values: string[]; // yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss
};

export type RelativeDateFilterParts = {
  column: ColumnMetadata;
  value: number | "current";
  bucket: BucketName;
  offsetValue?: number;
  offsetBucket?: BucketName;
  options: RelativeDateFilterOptions;
};

export type RelativeDateFilterOptions = {
  "include-current"?: boolean;
};

export type ExcludeDateFilterOperatorName =
  typeof EXCLUDE_DATE_FILTER_OPERATORS[number];

/*
 * values depend on the bucket
 * day-of-week => 1-7 (Monday-Sunday)
 * month-of-year => 1-12 (January-December)
 * quarter-of-year => 1-4
 * hour-of-day => 0-23
 */
export type ExcludeDateFilterParts = {
  operator: ExcludeDateFilterOperatorName;
  column: ColumnMetadata;
  values: number[];
  bucket: BucketName;
};

export type TimeFilterOperatorName = typeof TIME_FILTER_OPERATORS[number];

export type TimeFilterParts = {
  operator: TimeFilterOperatorName;
  column: ColumnMetadata;
  values: string[]; // ISO 8601 date with time
};

declare const Join: unique symbol;
export type Join = unknown & { _opaque: typeof Join };

declare const JoinCondition: unique symbol;
export type JoinCondition = unknown & { _opaque: typeof JoinCondition };

declare const JoinConditionOperator: unique symbol;
export type JoinConditionOperator = unknown & {
  _opaque: typeof JoinConditionOperator;
};

export type JoinConditionOperatorDisplayInfo = {
  displayName: string;
  shortName: string;
  default?: boolean;
};

declare const JoinStrategy: unique symbol;
export type JoinStrategy = unknown & { _opaque: typeof Join };

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
  | "drill-thru/underlying-records";

export type BaseDrillThruInfo<Type extends DrillThruType> = { type: Type };

export type QuickFilterDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/quick-filter"> & {
    operators: Array<"=" | "≠" | "<" | ">">;
  };

type ObjectDetailsDrillThruInfo<Type extends DrillThruType> =
  BaseDrillThruInfo<Type> & {
    objectId: string | number;
    "manyPks?": boolean; // TODO [33479]: this should be "manyPks"
  };
export type PKDrillThruInfo = ObjectDetailsDrillThruInfo<"drill-thru/pk">;
export type ZoomDrillThruInfo = ObjectDetailsDrillThruInfo<"drill-thru/zoom">;
export type FKDetailsDrillThruInfo =
  ObjectDetailsDrillThruInfo<"drill-thru/fk-details">;
export type PivotDrillThruInfo = ObjectDetailsDrillThruInfo<"drill-thru/pivot">;

export type FKFilterDrillThruInfo = BaseDrillThruInfo<"drill-thru/fk-filter">;
export type DistributionDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/distribution">;

export type SortDrillThruInfo = BaseDrillThruInfo<"drill-thru/sort"> & {
  directions: Array<"asc" | "desc">;
};

export type SummarizeColumnDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/summarize-column"> & {
    aggregations: Array<"sum" | "avg" | "distinct">;
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
  | UnderlyingRecordsDrillThruInfo;

export interface Dimension {
  column: DatasetColumn;
  value?: RowValue;
}

export type DataRow = Array<{
  col: DatasetColumn | ColumnMetadata | null;
  value: RowValue;
}>;
