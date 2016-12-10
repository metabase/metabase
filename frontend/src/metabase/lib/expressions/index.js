
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


export function normalizeName(name) {
    return titleize(name).replace(/\W+/g, "")
}

// move to query lib

export function isExpression(expr) {
    return isMath(expr) || isAggregation(expr) || isMetric(expr);
}

export function isField(expr) {
    return Array.isArray(expr) && expr.length === 2 && mbqlEq(expr[0], 'field-id') && typeof expr[1] === 'number';
}

export function isMetric(expr) {
    return Array.isArray(expr) && expr.length === 2 && mbqlEq(expr[0], 'metric') && typeof expr[1] === 'number';
}

export function isMath(expr) {
    return Array.isArray(expr) && VALID_OPERATORS.has(expr[0]) && _.all(expr.slice(1), isValidArg);
}

export function isAggregation(expr) {
    return Array.isArray(expr) && VALID_AGGREGATIONS.has(expr[0]) && _.all(expr.slice(1), isValidArg);
}

export function isValidArg(arg) {
    return isExpression(arg) || isField(arg) || typeof arg === 'number';
}
