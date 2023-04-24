/**
 * ⚠️
 * @deprecated use existing types from, or add to metabase-types/api/*
 */

import { TemplateTags, DatetimeUnit } from "metabase-types/api";
import { TableId } from "./Table";
import { BaseType, FieldId } from "./Field";
import { SegmentId } from "./Segment";
import { MetricId } from "./Metric";

export type ExpressionName = string;

export type StringLiteral = string;
export type NumericLiteral = number;
export type DatetimeLiteral = string;

export type Value =
  | null
  | boolean
  | StringLiteral
  | NumericLiteral
  | DatetimeLiteral;
export type OrderableValue = NumericLiteral | DatetimeLiteral;

export type RelativeDatetimePeriod = "current" | "last" | "next" | number;
export type RelativeDatetimeUnit =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

export type NativeQuery = {
  query: string;
  "template-tags"?: TemplateTags;
};

// "card__4" like syntax meaning a query is using card 4 as a data source
type NestedQueryTableId = string;

export type SourceTableId = TableId | NestedQueryTableId;

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

export type AggregationClause =
  | Aggregation // @deprecated: aggregation clause is now an array
  | Array<Aggregation>;

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

export type AggregationWithOptions = [
  "aggregation-options",
  Aggregation,
  AggregationOptions,
];

export type AggregationOptions = {
  "display-name"?: string;
};

type CountAgg = ["count"];

type CountFieldAgg = ["count", ConcreteField];
type AvgAgg = ["avg", ConcreteField];
type MedianAgg = ["median", ConcreteField];
type CumSumAgg = ["cum-sum", ConcreteField];
type DistinctAgg = ["distinct", ConcreteField];
type StdDevAgg = ["stddev", ConcreteField];
type SumAgg = ["sum", ConcreteField];
type MinAgg = ["min", ConcreteField];
type MaxAgg = ["max", ConcreteField];

type MetricAgg = ["metric", MetricId];

export type BreakoutClause = Array<Breakout>;
export type Breakout = ConcreteField;

export type FilterClause = Filter;
export type Filter = FieldFilter | CompoundFilter | NotFilter | SegmentFilter;

export type CompoundFilter = AndFilter | OrFilter;

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

export type AndFilter = ["and", Filter, Filter];
export type OrFilter = ["or", Filter, Filter];

export type NotFilter = ["not", Filter];

export type EqualityFilter = ["=" | "!=", ConcreteField, Value];
export type ComparisonFilter = [
  "<" | "<=" | ">=" | ">",
  ConcreteField,
  OrderableValue,
];
export type BetweenFilter = [
  "between",
  ConcreteField,
  OrderableValue,
  OrderableValue,
];
export type StringFilter =
  | [
      "starts-with" | "contains" | "does-not-contain" | "ends-with",
      ConcreteField,
      StringLiteral,
    ]
  | [
      "starts-with" | "contains" | "does-not-contain" | "ends-with",
      ConcreteField,
      StringLiteral,
      StringFilterOptions,
    ];

export type StringFilterOptions = {
  "case-sensitive"?: false;
};

export type NullFilter = ["is-null", ConcreteField];
export type NotNullFilter = ["not-null", ConcreteField];
export type EmptyFilter = ["is-empty", ConcreteField];
export type NotEmptyFilter = ["not-empty", ConcreteField];
export type InsideFilter = [
  "inside",
  ConcreteField,
  ConcreteField,
  NumericLiteral,
  NumericLiteral,
  NumericLiteral,
  NumericLiteral,
];
export type TimeIntervalFilter =
  | [
      "time-interval",
      ConcreteField,
      RelativeDatetimePeriod,
      RelativeDatetimeUnit,
    ]
  | [
      "time-interval",
      ConcreteField,
      RelativeDatetimePeriod,
      RelativeDatetimeUnit,
      TimeIntervalFilterOptions,
    ];

export type TimeIntervalFilterOptions = {
  "include-current"?: boolean;
};

export type FilterOptions = StringFilterOptions | TimeIntervalFilterOptions;

// NOTE: currently the backend expects SEGMENT to be uppercase
export type SegmentFilter = ["segment", SegmentId];

export type OrderByClause = Array<OrderBy>;
export type OrderBy = ["asc" | "desc", Field];

export type JoinStrategy =
  | "left-join"
  | "right-join"
  | "inner-join"
  | "full-join";
export type JoinAlias = string;
export type JoinCondition = Filter;
export type JoinFields = "all" | "none" | JoinedFieldReference[];

export type JoinClause = Array<Join>;
export type Join = {
  "source-table"?: TableId;
  "source-query"?: StructuredQuery;
  condition: JoinCondition;
  alias?: JoinAlias;
  strategy?: JoinStrategy;
  fields?: JoinFields;
};

type LimitClause = number;

export type Field = ConcreteField | AggregateField;

export type ConcreteField =
  | LocalFieldReference
  | FieldLiteral
  | ForeignFieldReference
  | JoinedFieldReference
  | ExpressionReference
  | DatetimeField
  | BinnedField;

export type LocalFieldReference = [
  "field",
  FieldId,
  Record<string, unknown> | null,
];

export type ForeignFieldReference = [
  "field",
  FieldId | string,
  { "source-field": FieldId | string },
];

export type ExpressionReference = ["expression", ExpressionName];

export type FieldLiteral = ["field", string, { "base-type": BaseType }];

export type JoinedFieldReference = [
  "field",
  FieldId | string,
  { "join-alias": string },
];

export type DatetimeField = [
  "field",
  FieldId | string,
  { "temporal-unit": DatetimeUnit },
];

// @deprecated
export type BinnedField = [
  "field",
  FieldId | string,
  {
    binning:
      | { strategy: "num-bins"; "num-bins": number }
      | { strategy: "bin-width"; "bin-width": number }
      | { strategy: "default" };
  },
];

export type AggregateField = ["aggregation", number];

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

export type ExpressionOperator = string;
export type ExpressionOperand =
  | ConcreteField
  | NumericLiteral
  | StringLiteral
  | boolean
  | Expression;

export type FieldsClause = ConcreteField[];

export type DependentTable = {
  id: number | string;
  type: "table";
  foreignTables?: boolean;
};

export type DependentField = {
  id: number;
  type: "field";
};

export type DependentMetadataItem = DependentTable | DependentField;
