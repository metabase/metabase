/* @flow */

import type { TableId } from "./Table";
import type { FieldId } from "./Field";
import type { SegmentId } from "./Segment";
import type { ParameterType } from "./Dashboard";

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

export type TemplateTagId = string;

export type TemplateTag = {
    id:           TemplateTagId,
    name:         string,
    display_name: string,
    type:         string,
    dimension?:   ["field-id", number],
    widget_type?: ParameterType,
    required?:    boolean,
    default?:     string,
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
export type Filter = FieldFilter | CompoundFilter | NotFilter | SegmentFilter;

export type CompoundFilter =
    AndFilter          |
    OrFilter;

export type FieldFilter =
    EqualityFilter     |
    ComparisonFilter   |
    BetweenFilter      |
    StringFilter       |
    NullFilter         |
    NotNullFilter      |
    InsideFilter       |
    TimeIntervalFilter;

export type AndFilter          = ["and", Filter, Filter];
export type OrFilter           = ["or", Filter, Filter];

export type NotFilter          = ["not", Filter];

export type EqualityFilter     = ["="|"!=", ConcreteField, Value];
export type ComparisonFilter   = ["<"|"<="|">="|">", ConcreteField, OrderableValue];
export type BetweenFilter      = ["between", ConcreteField, OrderableValue, OrderableValue];
export type StringFilter       = ["starts-with"|"contains"|"does-not-contain"|"ends-with", ConcreteField, StringLiteral];

export type NullFilter         = ["is-null", ConcreteField];
export type NotNullFilter      = ["not-null", ConcreteField];
export type InsideFilter       = ["inside", ConcreteField, ConcreteField, NumericLiteral, NumericLiteral, NumericLiteral, NumericLiteral];
export type TimeIntervalFilter = ["time-interval", ConcreteField, RelativeDatetimePeriod, RelativeDatetimeUnit];

export type SegmentFilter      = ["segment", SegmentId];

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
