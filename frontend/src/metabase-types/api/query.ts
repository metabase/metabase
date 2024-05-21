import type {
  DatabaseId,
  FieldId,
  MetricId,
  TableId,
  SegmentId,
  TemplateTags,
} from "metabase-types/api";

export interface NativeQuery {
  query: string;
  "template-tags"?: TemplateTags;
  collection?: string;
}

export interface StructuredDatasetQuery {
  type: "query";
  query: StructuredQuery;

  // Database is null when missing data permissions to the database
  database: DatabaseId | null;
}

export interface NativeDatasetQuery {
  type: "native";
  native: NativeQuery;

  // Database is null when missing data permissions to the database
  database: DatabaseId | null;
  parameters?: unknown[];
}

export type DatasetQuery = StructuredDatasetQuery | NativeDatasetQuery;

interface PublicStructuredDatasetQuery {
  type: "query";
}

interface PublicNativeDatasetQuery {
  type: "native";
  native: {
    "template-tags"?: TemplateTags;
  };
}

export type PublicDatasetQuery =
  | PublicStructuredDatasetQuery
  | PublicNativeDatasetQuery;

export const dateTimeAbsoluteUnits = [
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
] as const;

export const dateTimeRelativeUnits = [
  "minute-of-hour",
  "hour-of-day",
  "day-of-week",
  "day-of-month",
  "day-of-year",
  "week-of-year",
  "month-of-year",
  "quarter-of-year",
] as const;

export const dateTimeUnits = [
  ...dateTimeAbsoluteUnits,
  ...dateTimeRelativeUnits,
] as const;

export type DateTimeAbsoluteUnit = typeof dateTimeAbsoluteUnits[number];
export type DateTimeRelativeUnit = typeof dateTimeRelativeUnits[number];
export type DatetimeUnit =
  | "default"
  | DateTimeAbsoluteUnit
  | DateTimeRelativeUnit;

export interface ReferenceOptions {
  binning?: BinningOptions;
  "temporal-unit"?: DatetimeUnit;
  "join-alias"?: string;
  "base-type"?: string;
}

type BinningOptions =
  | DefaultBinningOptions
  | NumBinsBinningOptions
  | BinWidthBinningOptions;

interface DefaultBinningOptions {
  strategy: "default";
}

interface NumBinsBinningOptions {
  strategy: "num-bins";
  "num-bins": number;
}

interface BinWidthBinningOptions {
  strategy: "bin-width";
  "bin-width": number;
}

export type ReferenceOptionsKeys =
  | "source-field"
  | "base-type"
  | "join-alias"
  | "temporal-unit"
  | "binning";

type ExpressionName = string;

type StringLiteral = string;
type NumericLiteral = number;
type DatetimeLiteral = string;

type Value = null | boolean | StringLiteral | NumericLiteral | DatetimeLiteral;
type OrderableValue = NumericLiteral | DatetimeLiteral;

type RelativeDatetimePeriod = "current" | "last" | "next" | number;

type OffsetOptions = {
  "lib/uuid": string;
  name: string;
  "display-name": string;
};

// "card__4" like syntax meaning a query is using card 4 as a data source
type NestedQueryTableId = string;

type SourceTableId = TableId | NestedQueryTableId;

export type StructuredQuery = {
  "source-table"?: SourceTableId;
  "source-query"?: StructuredQuery;
  aggregation?: AggregationClause;
  breakout?: BreakoutClause;
  filter?: FilterClause;
  joins?: JoinClause;
  "order-by"?: OrderByClause;
  limit?: LimitClause;
  expressions?: ExpressionClause;
  fields?: FieldsClause;
};

export type AggregationClause = Aggregation[];

type CountAgg = ["count"];

type CountFieldAgg = ["count", ConcreteFieldReference];
type AvgAgg = ["avg", ConcreteFieldReference];
type MedianAgg = ["median", ConcreteFieldReference];
type CumSumAgg = ["cum-sum", ConcreteFieldReference];
type DistinctAgg = ["distinct", ConcreteFieldReference];
type StdDevAgg = ["stddev", ConcreteFieldReference];
type SumAgg = ["sum", ConcreteFieldReference];
type MinAgg = ["min", ConcreteFieldReference];
type MaxAgg = ["max", ConcreteFieldReference];
type OffsetAgg = ["offset", OffsetOptions, Aggregation, NumericLiteral];

type CommonAggregation =
  | CountAgg
  | CountFieldAgg
  | AvgAgg
  | MedianAgg
  | CumSumAgg
  | DistinctAgg
  | StdDevAgg
  | SumAgg
  | MinAgg
  | MaxAgg
  | OffsetAgg;

type MetricAgg = ["metric", MetricId];

type InlineExpressionAgg = [
  "aggregation-options",
  CommonAggregation,
  { name: string; "display-name": string },
];

/**
 * An aggregation MBQL clause
 */
export type Aggregation = CommonAggregation | MetricAgg | InlineExpressionAgg;

type BreakoutClause = Breakout[];
export type Breakout = ConcreteFieldReference;

type FilterClause = Filter;
export type Filter = FieldFilter | CompoundFilter | NotFilter | SegmentFilter;

type AndFilter = ["and", Filter, Filter];
type OrFilter = ["or", Filter, Filter];
type CompoundFilter = AndFilter | OrFilter;

export type FieldFilter =
  | EqualityFilter
  | ComparisonFilter
  | BetweenFilter
  | StringFilter
  | NullFilter
  | NotNullFilter
  | EmptyFilter
  | NotEmptyFilter
  | InsideFilter
  | TimeIntervalFilter;

type NotFilter = ["not", Filter];

type EqualityFilter = ["=" | "!=", ConcreteFieldReference, Value];
export type ComparisonFilter = [
  "<" | "<=" | ">=" | ">",
  ConcreteFieldReference,
  OrderableValue,
];
type BetweenFilter = [
  "between",
  ConcreteFieldReference,
  OrderableValue,
  OrderableValue,
];
type StringFilter =
  | [
      "starts-with" | "contains" | "does-not-contain" | "ends-with",
      ConcreteFieldReference,
      StringLiteral,
    ]
  | [
      "starts-with" | "contains" | "does-not-contain" | "ends-with",
      ConcreteFieldReference,
      StringLiteral,
      StringFilterOptions,
    ];

type StringFilterOptions = {
  "case-sensitive"?: false;
};

type NullFilter = ["is-null", ConcreteFieldReference];
type NotNullFilter = ["not-null", ConcreteFieldReference];
type EmptyFilter = ["is-empty", ConcreteFieldReference];
type NotEmptyFilter = ["not-empty", ConcreteFieldReference];
type InsideFilter = [
  "inside",
  ConcreteFieldReference,
  ConcreteFieldReference,
  NumericLiteral,
  NumericLiteral,
  NumericLiteral,
  NumericLiteral,
];
type TimeIntervalFilter =
  | [
      "time-interval",
      ConcreteFieldReference,
      RelativeDatetimePeriod,
      DateTimeAbsoluteUnit,
    ]
  | [
      "time-interval",
      ConcreteFieldReference,
      RelativeDatetimePeriod,
      DateTimeAbsoluteUnit,
      TimeIntervalFilterOptions,
    ];

type TimeIntervalFilterOptions = {
  "include-current"?: boolean;
};

type SegmentFilter = ["segment", SegmentId];

type OrderByClause = Array<OrderBy>;
export type OrderBy = ["asc" | "desc", FieldReference];

export type JoinStrategy =
  | "left-join"
  | "right-join"
  | "inner-join"
  | "full-join";
export type JoinAlias = string;
export type JoinCondition = ["=", FieldReference, FieldReference];
export type JoinFields = "all" | "none" | JoinedFieldReference[];

type JoinClause = Array<Join>;
export type Join = {
  "source-table"?: TableId;
  "source-query"?: StructuredQuery;
  condition: JoinCondition;
  alias?: JoinAlias;
  strategy?: JoinStrategy;
  fields?: JoinFields;
};

type LimitClause = number;

export type FieldReference = ConcreteFieldReference | AggregateFieldReference;

export type ConcreteFieldReference =
  | LocalFieldReference
  | FieldLiteral
  | ForeignFieldReference
  | JoinedFieldReference
  | ExpressionReference
  | DatetimeField
  | BinnedField;

export type LocalFieldReference = ["field", FieldId, ReferenceOptions | null];

export type ForeignFieldReference = [
  "field",
  FieldId | string,
  ReferenceOptions & { "source-field": FieldId | string },
];

export type ExpressionReference = [
  "expression",
  ExpressionName,
  (ReferenceOptions | null)?,
];

export type FieldLiteral = [
  "field",
  string,
  ReferenceOptions & { "base-type": string },
];

export type JoinedFieldReference = [
  "field",
  FieldId | string,
  ReferenceOptions & { "join-alias": string },
];

type DatetimeField = [
  "field",
  FieldId | string,
  Omit<ReferenceOptions, "binning"> & { "temporal-unit": DatetimeUnit },
];

export type BinnedField = [
  "field",
  FieldId | string,
  Omit<ReferenceOptions, "temporal-unit"> & {
    binning: BinningOptions;
  },
];

export type AggregateFieldReference =
  | ["aggregation", number, ReferenceOptions | null]
  | ["aggregation", number];

export type ExpressionClause = {
  [key: ExpressionName]: Expression;
};

export type Expression =
  | NumericLiteral
  | StringLiteral
  | boolean
  | [ExpressionOperator, ExpressionOperand]
  | [ExpressionOperator, ExpressionOperand, ExpressionOperand]
  | ["offset", OffsetOptions, ExpressionOperand, NumericLiteral]
  | [
      ExpressionOperator,
      ExpressionOperand,
      ExpressionOperand,
      ExpressionOperand,
    ]
  | ConcreteFieldReference;

type ExpressionOperator = string;
type ExpressionOperand =
  | ConcreteFieldReference
  | NumericLiteral
  | StringLiteral
  | boolean
  | Expression;

type FieldsClause = ConcreteFieldReference[];

export type TagName = string;
export type TemplateTagReference = ["template-tag", TagName];

export type DimensionReferenceWithOptions =
  | FieldReference
  | ExpressionReference
  | AggregateFieldReference;

export type DimensionReference =
  | DimensionReferenceWithOptions
  | TemplateTagReference;
