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
  database: DatabaseId;
  query: StructuredQuery;
}

export interface NativeDatasetQuery {
  type: "native";
  database: DatabaseId;
  native: NativeQuery;
}

export type DatasetQuery = StructuredDatasetQuery | NativeDatasetQuery;

export type DatetimeUnit =
  | "default"
  | "minute"
  | "minute-of-hour"
  | "hour"
  | "hour-of-day"
  | "day"
  | "day-of-week"
  | "day-of-month"
  | "day-of-year"
  | "week"
  | "week-of-year"
  | "month"
  | "month-of-year"
  | "quarter"
  | "quarter-of-year"
  | "year";

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
type RelativeDatetimeUnit =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

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

type MetricAgg = ["metric", MetricId];

/**
 * An aggregation MBQL clause
 */
export type Aggregation =
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
  | MetricAgg;

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
type ComparisonFilter = [
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
      RelativeDatetimeUnit,
    ]
  | [
      "time-interval",
      ConcreteFieldReference,
      RelativeDatetimePeriod,
      RelativeDatetimeUnit,
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
export type JoinCondition = Filter;
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
  ReferenceOptions | null,
];

type FieldLiteral = [
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

export type AggregateFieldReference = [
  "aggregation",
  number,
  ReferenceOptions | null,
];

export type ExpressionClause = {
  [key: ExpressionName]: Expression;
};

export type Expression =
  | NumericLiteral
  | StringLiteral
  | boolean
  | [ExpressionOperator, ExpressionOperand]
  | [ExpressionOperator, ExpressionOperand, ExpressionOperand]
  | [
      ExpressionOperator,
      ExpressionOperand,
      ExpressionOperand,
      ExpressionOperand,
    ];

type ExpressionOperator = string;
type ExpressionOperand =
  | ConcreteFieldReference
  | NumericLiteral
  | StringLiteral
  | boolean
  | Expression;

type FieldsClause = ConcreteFieldReference[];

type DependentTable = {
  id: number | string;
  type: "table";
  foreignTables?: boolean;
};

type DependentField = {
  id: number;
  type: "field";
};

export type DependentMetadataItem = DependentTable | DependentField;

export type TagName = string;
export type TemplateTagReference = ["template-tag", TagName];

export type DimensionReferenceWithOptions =
  | FieldReference
  | ExpressionReference
  | AggregateFieldReference;

export type DimensionReference =
  | DimensionReferenceWithOptions
  | TemplateTagReference;
