/* eslint-disable @typescript-eslint/no-unused-vars -- used for types */
import type {
  Metabase_Lib_Aggregation_Aggregable,
  Metabase_Lib_Schema_Aggregation_Aggregation,
  Metabase_Lib_Schema_Aggregation_Operator,
  Metabase_Lib_Schema_Binning_Binning,
  Metabase_Lib_Schema_Binning_BinningOption,
  Metabase_Lib_Schema_DrillThru_DrillThru,
  Metabase_Lib_Schema_Expression_Expression,
  Metabase_Lib_Schema_Extraction_Extraction,
  Metabase_Lib_Schema_Filter_Operator,
  Metabase_Lib_Schema_Filters,
  Metabase_Lib_Schema_Join_Conditions,
  Metabase_Lib_Schema_Join_Join,
  Metabase_Lib_Schema_Join_Joins,
  Metabase_Lib_Schema_Join_Strategy,
  Metabase_Lib_Schema_Join_StrategyOption,
  Metabase_Lib_Schema_MbqlClause_Clause,
  Metabase_Lib_Schema_Metadata_Card,
  Metabase_Lib_Schema_Metadata_Column,
  Metabase_Lib_Schema_Metadata_Measure,
  Metabase_Lib_Schema_Metadata_Metric,
  Metabase_Lib_Schema_Metadata_Segment,
  Metabase_Lib_Schema_Metadata_Table,
  Metabase_Lib_Schema_OrderBy_OrderBy,
  Metabase_Lib_Schema_OrderBy_OrderBys,
  Metabase_Lib_Schema_Query,
  Metabase_Lib_Schema_TemporalBucketing_Option,
} from "cljs/metabase.lib.js";
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

import type { ColumnExtractionTag } from "./extractions";

/**
 * An "opaque type": this technique gives us a way to pass around opaque CLJS values that TS will track for us,
 * and in other files it gets treated like `unknown` so it can't be examined, manipulated or a new one created.
 */
declare const QuerySymbol: unique symbol;
export type Query = Metabase_Lib_Schema_Query;

declare const MetadataProviderSymbol: unique symbol;
export type MetadataProvider = unknown & {
  _opaque: typeof MetadataProviderSymbol;
};

export type TableMetadata = Metabase_Lib_Schema_Metadata_Table;

export type CardMetadata = Metabase_Lib_Schema_Metadata_Card;

export type SegmentMetadata = Metabase_Lib_Schema_Metadata_Segment;

export type MetricMetadata = Metabase_Lib_Schema_Metadata_Metric;

export type MeasureMetadata = Metabase_Lib_Schema_Metadata_Measure;

export type AggregationClause = Metabase_Lib_Schema_Aggregation_Aggregation;

export type Aggregable = Metabase_Lib_Aggregation_Aggregable;

export type AggregationOperator = Metabase_Lib_Schema_Aggregation_Operator & {
  columns?: Metabase_Lib_Schema_Metadata_Column[];
};

export type BreakoutClause = Metabase_Lib_Schema_Expression_Expression;

export type ExpressionClause = Metabase_Lib_Schema_MbqlClause_Clause;

export type OrderByClause = Metabase_Lib_Schema_OrderBy_OrderBy;

export type OrderByDirection = "asc" | "desc";

export type FilterClause = Metabase_Lib_Schema_MbqlClause_Clause;

export type Filterable = FilterClause | ExpressionClause | SegmentMetadata;

export type Join = Metabase_Lib_Schema_Join_Join;

export type JoinStrategy = Metabase_Lib_Schema_Join_Strategy | Metabase_Lib_Schema_Join_StrategyOption;

export type JoinCondition = Metabase_Lib_Schema_MbqlClause_Clause;

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

export type ColumnMetadata = Metabase_Lib_Schema_Metadata_Column;

declare const ColumnTypeInfoSymbol: unique symbol;
export type ColumnTypeInfo = unknown & { _opaque: typeof ColumnTypeInfoSymbol };

export type ColumnGroup = {
  type: "column-group";
  "group-type": "main" | "join.explicit" | "join.implicit";
  columns: ColumnMetadata[];
} & (
  | { "join-alias"?: string; "table-id"?: number; "card-id"?: number }
  | { "fk-field-id": number }
);

export type Bucket = Metabase_Lib_Schema_Binning_Binning | Metabase_Lib_Schema_TemporalBucketing_Option;
export type BucketOption = Metabase_Lib_Schema_Binning_BinningOption | Metabase_Lib_Schema_TemporalBucketing_Option;

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
  default?: boolean;
  description?: string;
  displayName: string;
  shortName: string;
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

export type FilterOperator = Metabase_Lib_Schema_Filter_Operator;

export type FilterOperatorName =
  | StringFilterOperator
  | NumberFilterOperator
  | BooleanFilterOperator
  | SpecificDateFilterOperator
  | ExcludeDateFilterOperator
  | CoordinateFilterOperator;

export type StringFilterOperator =
  | "="
  | "!="
  | "contains"
  | "does-not-contain"
  | "is-empty"
  | "not-empty"
  | "starts-with"
  | "ends-with";

export type NumberFilterOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | "between"
  | ">="
  | "<="
  | "is-null"
  | "not-null";

export type CoordinateFilterOperator =
  | "="
  | "!="
  | "inside"
  | ">"
  | "<"
  | "between"
  | ">="
  | "<=";

export type BooleanFilterOperator = "=" | "is-null" | "not-null";

export type SpecificDateFilterOperator = "=" | ">" | "<" | "between";

export type ExcludeDateFilterOperator = "!=" | "is-null" | "not-null";

export type TimeFilterOperator = ">" | "<" | "between" | "is-null" | "not-null";

export type DefaultFilterOperator = "is-null" | "not-null";

export type RelativeDateFilterUnit =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

export type ExcludeDateFilterUnit =
  | "hour-of-day"
  | "day-of-week"
  | "month-of-year"
  | "quarter-of-year";

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
  operator: StringFilterOperator;
  column: ColumnMetadata;
  values: string[];
  options: StringFilterOptions;
};

export type StringFilterOptions = {
  caseSensitive?: boolean;
};

export type NumberFilterValue = number | bigint;

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

export type RelativeDateFilterOptions = {
  includeCurrent?: boolean;
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

export type DrillThru = Metabase_Lib_Schema_DrillThru_DrillThru;

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

export type ColumnExtraction = Metabase_Lib_Schema_Extraction_Extraction;

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
