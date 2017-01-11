
import _ from "underscore";

import {
    VALID_OPERATORS, VALID_AGGREGATIONS, VALID_FUNCTIONS,
    isField, isMath, isFunction, isMetric, isAggregation, isExpressionReference,
    formatMetricName, formatFieldName, formatExpressionName
} from "../expressions";

// convert a MBQL expression back into an expression string
export function format(expr, {
    tableMetadata = {},
    customFields = {},
    operators = VALID_OPERATORS,
    functions = VALID_FUNCTIONS,
    aggregations = VALID_AGGREGATIONS
}, parens = false) {
    const info = { tableMetadata, customFields, operators, functions, aggregations };
    if (expr == null || _.isEqual(expr, [])) {
        return "";
    }
    if (typeof expr === "number") {
        return formatNumber(expr);
    } else if (typeof expr === "string") {
        return formatString(expr);
    }
    if (isField(expr)) {
        return formatField(expr, info);
    }
    if (isMetric(expr)) {
        return formatMetric(expr, info);
    }
    if (isFunction(expr)) {
        return formatFunction(expr, info, parens);
    }
    if (isMath(expr)) {
        return formatMath(expr, info, parens);
    }
    if (isAggregation(expr)) {
        return formatAggregation(expr, info);
    }
    if (isExpressionReference(expr)) {
        return formatExpressionReference(expr, info);
    }
    throw new Error("Unknown expression " + JSON.stringify(expr));
}

function formatNumber(expr) {
    return JSON.stringify(expr);
}

function formatString(expr) {
    // HACK FIXME
    return JSON.stringify(expr).replace(/"/g, "'");
}

function formatField([, fieldId], { tableMetadata: { fields } }) {
    const field = _.findWhere(fields, { id: fieldId });
    if (!field) {
        throw 'field with ID does not exist: ' + fieldId;
    }
    return formatFieldName(field);
}

function formatMetric([, metricId], { tableMetadata: { metrics } }) {
    const metric = _.findWhere(metrics, { id: metricId });
    if (!metric) {
        throw 'metric with ID does not exist: ' + metricId;
    }
    return formatMetricName(metric);
}

function formatExpressionReference([, expressionName]) {
    return formatExpressionName(expressionName);
}

function formatFunction([func, ...args], info) {
    return `${func}(${args.map(arg => format(arg, info)).join(", ")})`;
}

function formatMath([operator, ...args], info, parens) {
    let formatted = args.map(arg => format(arg, info, true)).join(` ${operator} `)
    return parens ? `(${formatted})` : formatted;
}

function formatAggregation([aggregation, ...args], info) {
    const { aggregations } = info;
    return args.length === 0 ?
        aggregations.get(aggregation) :
        `${aggregations.get(aggregation)}(${args.map(arg => format(arg, info)).join(", ")})`;
}
