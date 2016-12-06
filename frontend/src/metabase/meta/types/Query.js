/* @flow */

import type { TableId } from "./Table";
import type { FieldId } from "./Field";

export type SegmentId = number;
export type MetricId = number;

export type ExpressionName = string;

export type StringLiteral = string;
export type NumericLiteral = number;
export type DatetimeLiteral = string;

export type Value = null | boolean | StringLiteral | NumericLiteral | DatetimeLiteral;
export type OrderableValue = NumericLiteral | DatetimeLiteral;

export type RelativeDatetimePeriod = "current" | "last" | "next" | number;
export type RelativeDatetimeUnit = "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year";
export type DatetimeUnit = "default" | "minute" | "minute-of-hour" | "hour" | "hour-of-day" | "day" | "day-of-week" | "day-of-month" | "day-of-year" | "week" | "week-of-year" | "month" | "month-of-year" | "quarter" | "quarter-of-year" | "year";

export type TemplateTag = {
    name: string,
    display_name: string,
    type: string,
    dimension?: ["field-id", number]
};

export type NativeQuery = {
    query: string,
    template_tags: { [key: string]: TemplateTag }
};

export type StructuredQuery = {
    source_table: ?TableId,
    aggregation?: AggregationClause,
    breakout?:    BreakoutClause,
    filter?:      FilterClause,
    order_by?:    OrderByClause,
    limit?:       LimitClause,
    expressions?: ExpressionClause,
    fields?:      FieldsClause,
};

export type AggregationClause =
    Aggregation | // deprecated
    Array<Aggregation>;

export type Aggregation =
    Rows | // deprecated
    CountAgg |
    CountFieldAgg |
    AvgAgg |
    CumSumAgg |
    DistinctAgg |
    StdDevAgg |
    SumAgg |
    MinAgg |
    MaxAgg |
    MetricAgg;

type Rows           = ["rows"]; // deprecated
type CountAgg       = ["count"];
type CountFieldAgg  = ["count", ConcreteField];
type AvgAgg         = ["avg", ConcreteField];
type CumSumAgg      = ["cum_sum", ConcreteField];
type DistinctAgg    = ["distinct", ConcreteField];
type StdDevAgg      = ["stddev", ConcreteField];
type SumAgg         = ["sum", ConcreteField];
type MinAgg         = ["min", ConcreteField];
type MaxAgg         = ["max", ConcreteField];
type MetricAgg      = ["metric", MetricId];

export type BreakoutClause = Array<Breakout>;
export type Breakout =
    ConcreteField;

export type FilterClause = Filter;
export type Filter =
    AndFilter          |
    OrFilter           |
    NotFilter          |
    EqualFilter        |
    NEFilter           |
    LTFilter           |
    LTEFilter          |
    GTFilter           |
    GTEFilter          |
    NullFilter         |
    NotNullFilter      |
    NotNullFilter      |
    BetweenFilter      |
    InsideFilter       |
    StartsWithFilter   |
    ContainsFilter     |
    NotContainsFilter  |
    EndsWithFilter     |
    TimeIntervalFilter |
    SegmentFilter;

type AndFilter          = ["and", Filter, Filter];
type OrFilter           = ["or", Filter, Filter];
type NotFilter          = ["not", Filter];
type EqualFilter        = ["=", ConcreteField, Value];
type NEFilter           = ["!=", ConcreteField, Value];
type LTFilter           = ["<", ConcreteField, OrderableValue];
type LTEFilter          = ["<=", ConcreteField, OrderableValue];
type GTFilter           = [">", ConcreteField, OrderableValue];
type GTEFilter          = [">=", ConcreteField, OrderableValue];
type NullFilter         = ["is-null", ConcreteField];
type NotNullFilter      = ["not-null", ConcreteField];
type BetweenFilter      = ["between", ConcreteField, OrderableValue, OrderableValue];
type InsideFilter       = ["inside", ConcreteField, ConcreteField, NumericLiteral, NumericLiteral, NumericLiteral, NumericLiteral];
type StartsWithFilter   = ["starts-with", ConcreteField, StringLiteral];
type ContainsFilter     = ["contains", ConcreteField, StringLiteral];
type NotContainsFilter  = ["does-not-contain", ConcreteField, StringLiteral];
type EndsWithFilter     = ["ends-with", ConcreteField, StringLiteral];
type TimeIntervalFilter = ["time-interval", ConcreteField, RelativeDatetimePeriod, RelativeDatetimeUnit];
type SegmentFilter      = ["segment", SegmentId];

export type OrderByClause = Array<OrderBy>;
export type OrderBy = ["asc"|"desc", Field];

export type LimitClause = number;

export type Field =
    ConcreteField |
    AggregateField;

export type ConcreteField =
    LocalFieldReference |
    ForeignFieldReference |
    ExpressionReference |
    DatetimeField;

export type LocalFieldReference =
    ["field-id", FieldId] |
    FieldId; // deprecated

export type ForeignFieldReference =
    ["fk->", FieldId, FieldId];

export type ExpressionReference =
    ["expression", ExpressionName];

export type DatetimeField =
    ["datetime-field", LocalFieldReference | ForeignFieldReference, DatetimeUnit] |
    ["datetime-field", LocalFieldReference | ForeignFieldReference, "as", DatetimeUnit]; // deprecated

export type AggregateField = ["aggregation", number];


export type ExpressionClause = {
    [key: ExpressionName]: Expression
};

export type Expression =
    [ExpressionOperator, ExpressionOperand, ExpressionOperand];

export type ExpressionOperator = "+" | "-" | "*" | "/";
export type ExpressionOperand = ConcreteField | NumericLiteral | Expression;

export type FieldsClause = FieldId[];
