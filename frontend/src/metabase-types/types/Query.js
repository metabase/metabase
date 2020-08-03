/* @flow */

import type { TableId } from "./Table";
import type { FieldId, BaseType } from "./Field";
import type { SegmentId } from "./Segment";
import type { MetricId } from "./Metric";
import type { ParameterType } from "./Parameter";

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

export type TemplateTagId = string;
export type TemplateTagName = string;
export type TemplateTagType = "text" | "number" | "date" | "dimension";

export type TemplateTag = {
  id: TemplateTagId,
  name: TemplateTagName,
  "display-name": string,
  type: TemplateTagType,
  dimension?: LocalFieldReference,
  "widget-type"?: ParameterType,
  required?: boolean,
  default?: string,
};

export type TemplateTags = { [key: TemplateTagName]: TemplateTag };

export type NativeQuery = {
  query: string,
  "template-tags": TemplateTags,
};

export type StructuredQuery = {
  "source-table"?: ?TableId,
  "source-query"?: ?StructuredQuery,
  aggregation?: AggregationClause,
  breakout?: BreakoutClause,
  filter?: FilterClause,
  joins?: JoinClause,
  "order-by"?: OrderByClause,
  limit?: LimitClause,
  expressions?: ExpressionClause,
  fields?: FieldsClause,
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
  "display-name"?: string,
};

type CountAgg = ["count"];

type CountFieldAgg = ["count", ConcreteField];
type AvgAgg = ["avg", ConcreteField];
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
  "case-sensitive"?: false,
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
  "include-current"?: boolean,
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
  "source-table"?: TableId,
  "source-query"?: StructuredQuery,
  condition: JoinCondition,
  alias?: JoinAlias,
  strategy?: JoinStrategy,
  fields?: JoinFields,
};

export type LimitClause = number;

export type Field = ConcreteField | AggregateField;

export type ConcreteField =
  | LocalFieldReference
  | ForeignFieldReference
  | JoinedFieldReference
  | ExpressionReference
  | DatetimeField
  | BinnedField;

export type LocalFieldReference = ["field-id", FieldId] | FieldId; // @deprecated: use ["field-id", FieldId]

export type ForeignFieldReference = [
  "fk->",
  ["field-id", FieldId],
  ["field-id", FieldId],
];

export type ExpressionReference = ["expression", ExpressionName];

export type FieldLiteral = ["field-literal", string, BaseType]; // ["field-literal", name, base-type]

export type JoinedFieldReference = ["joined-field", JoinAlias, ConcreteField];

export type DatetimeField =
  | [
      "datetime-field",
      LocalFieldReference | ForeignFieldReference,
      DatetimeUnit,
    ]
  | [
      "datetime-field",
      LocalFieldReference | ForeignFieldReference,
      "as",
      DatetimeUnit,
    ]; // @deprecated: don't include the "as" element

export type BinnedField =
  | ["binning-strategy", LocalFieldReference | ForeignFieldReference, "default"] // default binning (as defined by backend)
  | [
      "binning-strategy",
      LocalFieldReference | ForeignFieldReference,
      "num-bins",
      number,
    ] // number of bins
  | [
      "binning-strategy",
      LocalFieldReference | ForeignFieldReference,
      "bin-width",
      number,
    ]; // width of each bin

export type AggregateField = ["aggregation", number];

export type ExpressionClause = {
  [key: ExpressionName]: Expression,
};

export type Expression = [
  ExpressionOperator,
  ExpressionOperand,
  ExpressionOperand,
];

export type ExpressionOperator = "+" | "-" | "*" | "/";
export type ExpressionOperand = ConcreteField | NumericLiteral | Expression;

export type FieldsClause = ConcreteField[];
