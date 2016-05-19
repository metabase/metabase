/* @flow */

import type { TableId } from "./base";

export type FieldId = number;
export type SegmentId = number;
export type MetricId = number;

export type StringLiteralType = string;
export type NumericLiteralType = number;
export type DatetimeLiteralType = string;

export type ValueType = null | boolean | StringLiteralType | NumericLiteralType | DatetimeLiteralType;
export type OrderableValueType = NumericLiteralType | DatetimeLiteralType;

export type RelativeDatetimePeriodType = "current" | "last" | "next" | number;
export type RelativeDatetimeUnitType = "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year";
export type DatetimeUnitType = "default" | "minute" | "minute-of-hour" | "hour" | "hour-of-day" | "day" | "day-of-week" | "day-of-month" | "day-of-year" | "week" | "week-of-year" | "month" | "month-of-year" | "quarter" | "quarter-of-year" | "year";

export type NativeQueryObject = {
    query: string
};

export type StructuredQueryObject = {
    source_table: ?TableId,
    aggregation?: AggregationClauseType,
    breakout?:    BreakoutClauseType,
    filter?:      FilterClause,
    order_by?:    OrderByClauseType,
    limit?:       number,
    expressions?: { [key: string]: ExpressionType }
};

export type AggregationClauseType =
    ["rows"] | // deprecated
    ["avg", ConcreteFieldType] |
    ["count"] |
    ["count", ConcreteFieldType] |
    ["cum_sum", ConcreteFieldType] |
    ["distinct", ConcreteFieldType] |
    ["stddev", ConcreteFieldType] |
    ["sum", ConcreteFieldType] |
    ["min", ConcreteFieldType] |
    ["max", ConcreteFieldType] |
    ["metric", MetricId];

export type BreakoutClauseType = Array<ConcreteFieldType>;
export type FilterClause =
    ["and",                 FilterClause] |
    ["or",                  FilterClause] |
    ["not",                 FilterClause] |
    ["=",                   ConcreteFieldType, ValueType] |
    ["!=",                  ConcreteFieldType, ValueType] |
    ["<",                   ConcreteFieldType, OrderableValueType] |
    [">",                   ConcreteFieldType, OrderableValueType] |
    ["<=",                  ConcreteFieldType, OrderableValueType] |
    [">=",                  ConcreteFieldType, OrderableValueType] |
    ["is-null",             ConcreteFieldType] |
    ["not-null",            ConcreteFieldType] |
    ["between",             ConcreteFieldType, OrderableValueType, OrderableValueType] |
    ["inside",              ConcreteFieldType, ConcreteFieldType, NumericLiteralType, NumericLiteralType, NumericLiteralType, NumericLiteralType] |
    ["starts-with",         ConcreteFieldType, StringLiteralType] |
    ["contains",            ConcreteFieldType, StringLiteralType] |
    ["does-not-contain",    ConcreteFieldType, StringLiteralType] |
    ["ends-with",           ConcreteFieldType, StringLiteralType] |
    ["time-interval",       ConcreteFieldType, RelativeDatetimePeriodType, RelativeDatetimeUnitType] |
    ["segment",             SegmentId];

export type OrderByClauseType = Array<OrderByType>;
export type OrderByType = ["asc" | "desc", FieldType];

export type FieldType =
    ConcreteFieldType |
    ExpressionReferenceType |
    AggregateFieldType;

export type ConcreteFieldType =
    LocalFieldReferenceType |
    ForeignFieldReferenceType |
    DatetimeFieldType;

export type LocalFieldReferenceType =
    ["field-id", FieldId] |
    FieldId; // deprecated

export type ForeignFieldReferenceType =
    ["fk->", FieldId, FieldId];

export type DatetimeFieldType =
    ["datetime-field", LocalFieldReferenceType | ForeignFieldReferenceType, DatetimeUnitType] |
    ["datetime-field", LocalFieldReferenceType | ForeignFieldReferenceType, "as", DatetimeUnitType]; // deprecated

export type ExpressionReferenceType = ["expression", string];

export type AggregateFieldType = ["aggregation", number];

export type ExpressionBinaryOperatorType = "+" | "-" | "*" | "/";
export type ExpressionArgumentType = ConcreteFieldType | NumericLiteralType;

export type ExpressionType =
    [ExpressionBinaryOperatorType, ExpressionArgumentType, ExpressionArgumentType];
