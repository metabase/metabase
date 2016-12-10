
import _ from "underscore";
import { mbqlEq } from "../query/util";
import { titleize } from "metabase/lib/formatting";

export const VALID_OPERATORS = new Set([
    '+',
    '-',
    '*',
    '/'
]);

export const VALID_AGGREGATIONS = new Map(Object.entries({
    "count": "Count",
    "cum_count": "CumulativeCount",
    "sum": "Sum",
    "cum_sum": "CumulativeSum",
    "distinct": "Distinct",
    "avg": "Average",
    "min": "Min",
    "max": "Max"
}));

export function formatMetricName(metricName) {
    return titleize(metricName).replace(/\W+/g, "")
}

export function formatFieldName(fieldName) {
    return /^\w+$/.test(fieldName) ?
        fieldName :
        JSON.stringify(fieldName);
}

export function formatExpressionName(name) {
    return formatFieldName(name);
}

// move to query lib

export function isExpression(expr) {
    return isMath(expr) || isAggregation(expr) || isField(expr) || isMetric(expr) || isExpressionReference(expr);
}

export function isField(expr) {
    return Array.isArray(expr) && expr.length === 2 && mbqlEq(expr[0], 'field-id') && typeof expr[1] === 'number';
}

export function isMetric(expr) {
    // case sensitive, unlike most mbql
    return Array.isArray(expr) && expr.length === 2 && expr[0] === "METRIC" && typeof expr[1] === 'number';
}

export function isMath(expr) {
    return Array.isArray(expr) && VALID_OPERATORS.has(expr[0]) && _.all(expr.slice(1), isValidArg);
}

export function isAggregation(expr) {
    return Array.isArray(expr) && VALID_AGGREGATIONS.has(expr[0]) && _.all(expr.slice(1), isValidArg);
}

export function isExpressionReference(expr) {
    return Array.isArray(expr) && expr.length === 2 && mbqlEq(expr[0], 'expression') && typeof expr[1] === 'string';
}

export function isValidArg(arg) {
    return isExpression(arg) || isField(arg) || typeof arg === 'number';
}
