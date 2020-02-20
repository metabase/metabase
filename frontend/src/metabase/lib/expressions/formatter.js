import _ from "underscore";

import {
  OPERATORS,
  AGGREGATIONS,
  FILTER_OPERATORS,
  isFieldReference,
  isMath,
  isMetric,
  isAggregation,
  isFunction,
  isFilter,
  formatMetricName,
  formatDimensionName,
  formatFunctionName,
  formatStringLiteral,
} from "../expressions";

const isCase = expr => Array.isArray(expr) && expr[0] === "case";

// convert a MBQL expression back into an expression string
export function format(
  expr,
  {
    query,
    operators = OPERATORS,
    aggregations = AGGREGATIONS,
    // DEPRECATED
    tableMetadata = query ? query.tableMetadata() : {},
    customFields = query ? query.customFields() : {},
  },
  parens = false,
) {
  const info = { query, tableMetadata, customFields, operators, aggregations };
  if (expr == null || _.isEqual(expr, [])) {
    return "";
  }
  if (typeof expr === "number") {
    return formatNumberLiteral(expr);
  } else if (typeof expr === "string") {
    return formatStringLiteral(expr);
  }
  if (isFieldReference(expr)) {
    return formatFieldReference(expr, info);
  }
  if (isMetric(expr)) {
    return formatMetric(expr, info);
  }
  if (isMath(expr)) {
    return formatMath(expr, info, parens);
  }
  if (isAggregation(expr)) {
    return formatAggregation(expr, info);
  }
  if (isFunction(expr)) {
    return formatFunction(expr, info);
  }
  if (isCase(expr)) {
    return formatCase(expr, info);
  }
  if (isFilter(expr)) {
    return formatFilter(expr, info);
  }
  throw new Error("Unknown expression " + JSON.stringify(expr));
}

function formatNumberLiteral(expr) {
  return JSON.stringify(expr);
}

function formatFieldReference(fieldRef, { query }) {
  if (query) {
    const dimension = query.parseFieldReference(fieldRef);
    return formatDimensionName(dimension);
  } else {
    throw new Error("`query` is a required parameter to format expressions");
  }
}

function formatMetric([, metricId], { tableMetadata: { metrics } }) {
  const metric = _.findWhere(metrics, { id: metricId });
  if (!metric) {
    throw "metric with ID does not exist: " + metricId;
  }
  return formatMetricName(metric);
}

function formatMath(mbql, info, parens) {
  return formatOperator(mbql, info, parens);
}

function formatAggregation([agg, ...args], info) {
  return formatCall(formatFunctionName(agg), args, info);
}

function formatFunction([fn, ...args], info) {
  return formatCall(formatFunctionName(fn), args, info);
}

function formatFilter(mbql, info) {
  if (FILTER_OPERATORS.has(mbql[0])) {
    return formatOperator(mbql, info);
  } else {
    const [fn, ...args] = mbql;
    return formatCall(formatFunctionName(fn), args, info);
  }
}

// UTILS

function formatCall(formattedName, args, info) {
  const formattedArgs = args.map(arg => format(arg, info)).join(", ");
  return args.length === 0
    ? formattedName
    : `${formattedName}(${formattedArgs})`;
}

const precedence = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
};

function formatOperator([op, ...args], info, parens) {
  const formatted = args
    .map(arg => {
      const isLowerPrecedence =
        isMath(arg) && precedence[op] > precedence[arg[0]];
      return format(arg, info, isLowerPrecedence);
    })
    .join(` ${op} `);
  return parens ? `(${formatted})` : formatted;
}

function formatCase([_, clauses, options = {}], info) {
  const formattedClauses = clauses
    .map(([filter, expr]) => format(filter, info) + ", " + format(expr, info))
    .join(", ");
  const defaultExpression =
    options.default !== undefined ? ", " + format(options.default, info) : "";
  return `Case(${formattedClauses}${defaultExpression})`;
}
