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

declare const ColumnWithOperators: unique symbol;
export type ColumnWithOperators = ColumnMetadata & {
  _opaque: typeof ColumnWithOperators;
};

declare const ColumnGroup: unique symbol;
export type ColumnGroup = unknown & { _opaque: typeof ColumnGroup };

declare const Bucket: unique symbol;
export type Bucket = unknown & { _opaque: typeof Bucket };

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

export type BucketDisplayInfo = {
  displayName: string;
  default?: boolean;
  selected?: boolean;
};

export type OrderByClauseDisplayInfo = ClauseDisplayInfo & {
  direction: OrderByDirection;
};

declare const FilterOperator: unique symbol;
export type FilterOperator = unknown & { _opaque: typeof FilterOperator };

export type FilterOperatorDisplayInfo = {
  displayName: string;
  shortName: string;
  longDisplayName: string;
  default?: boolean;
};

export type ExpressionArg =
  | null
  | boolean
  | number
  | string
  | ColumnMetadata
  | Clause;

export type ExternalOp = {
  operator: string;
  options: Record<string, unknown>;
  args: [ColumnMetadata, ...ExpressionArg[]];
};

export type FilterParts = {
  operator: FilterOperator;
  options: Record<string, unknown>;
  column: ColumnWithOperators | null;
  args: ExpressionArg[];
};

declare const Join: unique symbol;
export type Join = unknown & { _opaque: typeof Join };

declare const JoinStrategy: unique symbol;
export type JoinStrategy = unknown & { _opaque: typeof Join };

export type JoinStrategyDisplayInfo = {
  displayName: string;
  default?: boolean;
  shortName: string;
};

declare const DrillThru: unique symbol;
export type DrillThru = unknown & { _opaque: typeof DrillThru };

export type BaseDrillThruInfo<Type> = { type: Type };

export type QuickFilterDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/quick-filter"> & {
    operators: Array<"=" | "≠" | "<" | ">">;
  };

type ObjectDetailsDrillThruInfo<Type> = BaseDrillThruInfo<Type> & {
  objectId: string | number;
  manyPks: boolean;
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
    initialOp: { short: string };
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
  column: Record<string, unknown>;
  value?: any;
}

export type DataRow = Array<{ col: Record<string, unknown>; value: any }>;
