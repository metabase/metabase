/* eslint-disable @typescript-eslint/no-unused-vars -- used for types */
import type { DefinedClauseName } from "metabase/querying/expressions";
import type {
  CardId,
  DatabaseId,
  DatasetColumn,
  FieldId,
  FieldValuesType,
  RowValue,
  SchemaId,
  TableId,
  TableVisibilityType,
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

import type { ColumnExtractionTag } from "./extractions";

/**
 * An "opaque type": this technique gives us a way to pass around opaque CLJS values that TS will track for us,
 * and in other files it gets treated like `unknown` so it can't be examined, manipulated or a new one created.
 */
declare const QuerySymbol: unique symbol;
export type Query = unknown & { _opaque: typeof QuerySymbol };

declare const MetadataProviderSymbol: unique symbol;
export type MetadataProvider = unknown & {
  _opaque: typeof MetadataProviderSymbol;
};

declare const TableMetadataSymbol: unique symbol;
export type TableMetadata = unknown & { _opaque: typeof TableMetadataSymbol };

declare const CardMetadataSymbol: unique symbol;
export type CardMetadata = unknown & { _opaque: typeof CardMetadataSymbol };

declare const SegmentMetadataSymbol: unique symbol;
export type SegmentMetadata = unknown & {
  _opaque: typeof SegmentMetadataSymbol;
};

declare const MetricMetadataSymbol: unique symbol;
export type MetricMetadata = unknown & {
  _opaque: typeof MetricMetadataSymbol;
};

declare const MeasureMetadataSymbol: unique symbol;
export type MeasureMetadata = unknown & {
  _opaque: typeof MeasureMetadataSymbol;
};

declare const AggregationClauseSymbol: unique symbol;
export type AggregationClause = unknown & {
  _opaque: typeof AggregationClauseSymbol;
};

export type Aggregable =
  | AggregationClause
  | MetricMetadata
  | MeasureMetadata
  | ExpressionClause;

declare const AggregationOperatorSymbol: unique symbol;
export type AggregationOperator = unknown & {
  _opaque: typeof AggregationOperatorSymbol;
};

declare const BreakoutClauseSymbol: unique symbol;
export type BreakoutClause = unknown & { _opaque: typeof BreakoutClauseSymbol };

declare const ExpressionClauseSymbol: unique symbol;
export type ExpressionClause = unknown & {
  _opaque: typeof ExpressionClauseSymbol;
};

declare const OrderByClauseSymbol: unique symbol;
export type OrderByClause = unknown & { _opaque: typeof OrderByClauseSymbol };

export type OrderByDirection = "asc" | "desc";

declare const FilterClauseSymbol: unique symbol;
export type FilterClause = unknown & { _opaque: typeof FilterClauseSymbol };

export type Filterable = FilterClause | ExpressionClause | SegmentMetadata;

declare const JoinSymbol: unique symbol;
export type Join = unknown & { _opaque: typeof JoinSymbol };

declare const JoinStrategySymbol: unique symbol;
export type JoinStrategy = unknown & { _opaque: typeof JoinStrategySymbol };

declare const JoinConditionSymbol: unique symbol;
export type JoinCondition = unknown & { _opaque: typeof JoinConditionSymbol };

export type JoinConditionOperator = "=" | "!=" | ">" | "<" | ">=" | "<=";

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

export type Expressionable =
  | ExpressionClause
  | FilterClause
  | AggregationClause;

export type Limit = number | null;

declare const ColumnMetadataSymbol: unique symbol;
export type ColumnMetadata = unknown & { _opaque: typeof ColumnMetadataSymbol };

declare const ColumnTypeInfoSymbol: unique symbol;
export type ColumnTypeInfo = unknown & { _opaque: typeof ColumnTypeInfoSymbol };

declare const ColumnGroupSymbol: unique symbol;
export type ColumnGroup = unknown & { _opaque: typeof ColumnGroupSymbol };

declare const BucketSymbol: unique symbol;
export type Bucket = unknown & { _opaque: typeof BucketSymbol };

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
  isSourceTable?: boolean;
  isSourceCard?: boolean;
  isFromJoin: boolean;
  isImplicitlyJoinable: boolean;
  schema: SchemaId;
  isQuestion?: boolean;
  isModel?: boolean;
  isMetric?: boolean;
  visibilityType?: TableVisibilityType;
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

  breakoutPositions?: number[];
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
  isMainGroup?: boolean;
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

export type MeasureDisplayInfo = {
  name: string;
  displayName: string;
  longDisplayName: string;
  description: string;
  aggregationPositions?: number[];
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

export type ExpressionOperator = DefinedClauseName | "value";

export type ExpressionArg =
  | boolean
  | number
  | bigint
  | string
  | ColumnMetadata
  | SegmentMetadata
  | MetricMetadata
  | MeasureMetadata;

export type ExpressionParts = {
  operator: ExpressionOperator;
  args: (ExpressionArg | ExpressionParts)[];
  options: ExpressionOptions;
};

export type ExpressionOptions = {
  "case-sensitive"?: boolean;
  "include-current"?: boolean;
  "base-type"?: string;
  "effective-type"?: string;
  mode?: DatetimeMode;
};

export type FilterOperator =
  | StringFilterOperator
  | NumberFilterOperator
  | BooleanFilterOperator
  | SpecificDateFilterOperator
  | ExcludeDateFilterOperator
  | CoordinateFilterOperator;

export type FilterOperatorVariant = "default" | "number" | "temporal";

export type DatetimeMode =
  | "iso"
  | "simple"
  | "iso-bytes"
  | "simple-bytes"
  | "unix-seconds"
  | "unix-milliseconds"
  | "unix-microseconds"
  | "unix-nanoseconds";

export type FilterOperatorDisplayInfo = {
  shortName: FilterOperator;
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
  operator: StringFilterOperator;
  column: ColumnMetadata;
  values: string[];
  options: StringFilterOptions;
};

export type NumberFilterParts = {
  operator: NumberFilterOperator;
  column: ColumnMetadata;
  values: NumberFilterValue[];
};

export type CoordinateFilterParts = {
  operator: CoordinateFilterOperator;
  column: ColumnMetadata;
  longitudeColumn: ColumnMetadata | null;
  values: NumberFilterValue[];
};

export type BooleanFilterParts = {
  operator: BooleanFilterOperator;
  column: ColumnMetadata;
  values: boolean[];
};

export type SpecificDateFilterParts = {
  operator: SpecificDateFilterOperator;
  column: ColumnMetadata;
  values: Date[];
  hasTime: boolean;
};

export type RelativeDateFilterParts = {
  column: ColumnMetadata;
  unit: RelativeDateFilterUnit;
  value: number;
  offsetUnit: RelativeDateFilterUnit | null;
  offsetValue: number | null;
  options: RelativeDateFilterOptions;
};

/*
 * values depend on the bucket
 * day-of-week => 1-7 (Monday-Sunday)
 * month-of-year => 1-12 (January-December)
 * quarter-of-year => 1-4
 * hour-of-day => 0-23
 */
export type ExcludeDateFilterParts = {
  operator: ExcludeDateFilterOperator;
  column: ColumnMetadata;
  unit: ExcludeDateFilterUnit | null;
  values: number[];
};

export type TimeFilterParts = {
  operator: TimeFilterOperator;
  column: ColumnMetadata;
  values: Date[];
};

export type DefaultFilterParts = {
  operator: DefaultFilterOperator;
  column: ColumnMetadata;
};

export type JoinConditionParts = {
  operator: JoinConditionOperator;
  lhsExpression: ExpressionClause;
  rhsExpression: ExpressionClause;
};

export type JoinStrategyDisplayInfo = {
  displayName: string;
  default?: boolean;
  shortName: string;
};

declare const DrillThruSymbol: unique symbol;
export type DrillThru = unknown & { _opaque: typeof DrillThruSymbol };

export type DrillThruType =
  | "drill-thru/automatic-insights"
  | "drill-thru/column-extract"
  | "drill-thru/column-filter"
  | "drill-thru/combine-columns"
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

declare const ColumnExtractionSymbol: unique symbol;
export type ColumnExtraction = unknown & {
  _opaque: typeof ColumnExtractionSymbol;
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

export type ZoomGeographicDrillThruInfo =
  BaseDrillThruInfo<"drill-thru/zoom-in.geographic"> & {
    displayName: string;
  };

export type DrillThruDisplayInfo =
  | ColumnExtractDrillThruInfo
  | CombineColumnsDrillThruInfo
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
  | ZoomTimeseriesDrillThruInfo
  | ZoomGeographicDrillThruInfo;

export type FilterDrillDetails = {
  query: Query;
  stageIndex: number;
  column: ColumnMetadata;
};

export type PivotType = "category" | "location" | "time";

export type PivotDrillDetails = {
  pivotTypes: PivotType[];
  stageIndex: number;
};

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
    row: RowValue[];
    cols: DatasetColumn[];
  };
  extraData?: Record<string, unknown>;
  data?: ClickObjectDataRow[];
}

export interface FieldValuesSearchInfo {
  fieldId: FieldId | null;
  searchField: ColumnMetadata | null;
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
  id: SchemaId;
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

export type ValidationError = { message: string };
