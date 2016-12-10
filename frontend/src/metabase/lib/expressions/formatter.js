
import _ from "underscore";

import { VALID_OPERATORS, VALID_AGGREGATIONS, isValidArg, isField, isExpression, normalizeName } from "../expressions";
import { AggregationClause } from "../query";

function formatField(fieldRef, { fields }) {
    const fieldId = fieldRef[1];
    const field   = _.findWhere(fields, {id: fieldId});

    if (!field) throw 'field with ID does not exist: ' + fieldId;

    let displayName = field.display_name;
    return displayName.indexOf(' ') === -1 ? displayName : ('"' + displayName + '"');
}

function formatMetric(metricRef, { metrics }) {
    const metricId = metricRef[1];
    const metric   = _.findWhere(metrics, { id: metricId });

    if (!metric) throw 'metric with ID does not exist: ' + metricId;

    return normalizeName(metric.name) + "()";
}

function formatNestedExpression(expression, tableMetadata, parens = false) {
    let formattedExpression = format(expression, tableMetadata);
    if (VALID_OPERATORS.has(expression[0]) && parens) {
        return '(' + formattedExpression + ')';
    } else {
        return formattedExpression;
    }
}

function formatArg(arg, tableMetadata, parens = false) {
    if (!isValidArg(arg)) throw 'Invalid expression argument:' + arg;

    return isField(arg)            ? formatField(arg, tableMetadata)            :
           isExpression(arg)       ? formatNestedExpression(arg, tableMetadata, parens) :
           typeof arg === 'number' ? arg                                 :
                                     null;
}

/// convert a parsed expression back into an expression string
export function format(expression, tableMetadata = {}) {
    const { operators = VALID_OPERATORS, aggregations = VALID_AGGREGATIONS } = tableMetadata;

    if (!expression)               return null;
    if (!isExpression(expression)) throw 'Invalid expression: ' + expression;

    const [op, ...args] = expression;
    if (AggregationClause.isMetric(expression)) {
        return formatMetric(expression, tableMetadata)
    } else if (operators.has(op)) {
        return args.map(arg => formatArg(arg, tableMetadata, true)).join(` ${op} `)
    } else if (aggregations.has(op)) {
        return `${aggregations.get(op)}(${args.map(arg => formatArg(arg, tableMetadata, false)).join(", ")})`;
    } else {
        throw new Error("Unknown clause " + op);
    }
}
