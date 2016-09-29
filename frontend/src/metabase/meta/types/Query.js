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

export type NativeQueryObject = {
    query: string,
    template_tags: { [key: string]: TemplateTag }
};

export type StructuredQueryObject = {
    source_table: ?TableId,
    aggregation?: AggregationClause,
    breakout?:    BreakoutClause,
    filter?:      FilterClause,
    order_by?:    OrderByClause,
    limit?:       LimitClause,
    expressions?: { [key: ExpressionName]: Expression }
};

export type AggregationClause =
    ["rows"] | // deprecated
    ["count"] |
    ["count"|"avg"|"cum_sum"|"distinct"|"stddev"|"sum"|"min"|"max", ConcreteField] |
    ["metric", MetricId];

export type BreakoutClause = Array<ConcreteField>;
export type FilterClause =
    ["and"|"or",            FilterClause, FilterClause] |
    ["not",                 FilterClause] |
    ["="|"!=",              ConcreteField, Value] |
    ["<"|">"|"<="|">=",     ConcreteField, OrderableValue] |
    ["is-null"|"not-null",  ConcreteField] |
    ["between",             ConcreteField, OrderableValue, OrderableValue] |
    ["inside",              ConcreteField, ConcreteField, NumericLiteral, NumericLiteral, NumericLiteral, NumericLiteral] |
    ["starts-with"|"contains"|"does-not-contain"|"ends-with",
                            ConcreteField, StringLiteral] |
    ["time-interval",       ConcreteField, RelativeDatetimePeriod, RelativeDatetimeUnit] |
    ["segment",             SegmentId];

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

export type ExpressionOperator = "+" | "-" | "*" | "/";
export type ExpressionOperand = ConcreteField | NumericLiteral | Expression;

export type Expression =
    [ExpressionOperator, ExpressionOperand, ExpressionOperand];
