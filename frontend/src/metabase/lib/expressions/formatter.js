
import _ from "underscore";

import { VALID_OPERATORS, VALID_AGGREGATIONS, isValidArg, isField, isExpression } from "../expressions";

function formatField(fieldRef, fields) {
    let fieldID = fieldRef[1],
        field   = _.findWhere(fields, {id: fieldID});

    if (!field) throw 'field with ID does not exist: ' + fieldID;

    let displayName = field.display_name;
    return displayName.indexOf(' ') === -1 ? displayName : ('"' + displayName + '"');
}

function formatNestedExpression(expression, fields, parens = false) {
    let formattedExpression = format(expression, { fields });
    if (VALID_OPERATORS.has(expression[0]) && parens) {
        return '(' + formattedExpression + ')';
    } else {
        return formattedExpression;
    }
}

function formatArg(arg, fields, parens = false) {
    if (!isValidArg(arg)) throw 'Invalid expression argument:' + arg;

    return isField(arg)            ? formatField(arg, fields)            :
           isExpression(arg)       ? formatNestedExpression(arg, fields, parens) :
           typeof arg === 'number' ? arg                                 :
                                     null;
}

/// convert a parsed expression back into an expression string
export function format(expression, { fields, operators = VALID_OPERATORS, aggregations = VALID_AGGREGATIONS } = {}) {
    if (!expression)               return null;
    if (!isExpression(expression)) throw 'Invalid expression: ' + expression;

    const [op, ...args] = expression;
    if (operators.has(op)) {
        return args.map(arg => formatArg(arg, fields, true)).join(` ${op} `)
    } else if (aggregations.has(op)) {
        return `${aggregations.get(op)}(${args.map(arg => formatArg(arg, fields, false)).join(", ")})`;
    } else {
        throw new Error("Unknown clause " + op);
    }
}
