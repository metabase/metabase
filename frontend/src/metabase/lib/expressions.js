
import _ from "underscore";

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

// move to query lib

export function isField(arg) {
    return arg && arg.constructor === Array && arg.length === 2 && arg[0] === 'field-id' && typeof arg[1] === 'number';
}

export function isExpression(expr) {
    return isMath(expr) || isAggregation(expr);
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
