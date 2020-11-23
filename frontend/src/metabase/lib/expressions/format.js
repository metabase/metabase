import _ from "underscore";

import {
  MBQL_CLAUSES,
  OPERATOR_PRECEDENCE,
  isNumberLiteral,
  isStringLiteral,
  isOperator,
  isFunction,
  isDimension,
  isMetric,
  isSegment,
  isCase,
  formatMetricName,
  formatSegmentName,
  formatDimensionName,
  getExpressionName,
  formatStringLiteral,
  hasOptions,
} from ".";
import type StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

export { DISPLAY_QUOTES, EDITOR_QUOTES } from "./config";

type QuotesConfig = {};

type FormatterOptions = {
  query: StructuredQuery,
  quotes: QuotesConfig,
  parens: Boolean,
};

// convert a MBQL expression back into an expression string
export function format(mbql: any, options: FormatterOptions = {}) {
  if (mbql == null || _.isEqual(mbql, [])) {
    return "";
  } else if (isNumberLiteral(mbql)) {
    return formatNumberLiteral(mbql, options);
  } else if (isStringLiteral(mbql)) {
    return formatStringLiteral(mbql, options);
  } else if (isOperator(mbql)) {
    return formatOperator(mbql, options);
  } else if (isFunction(mbql)) {
    return formatFunction(mbql, options);
  } else if (isDimension(mbql)) {
    return formatDimension(mbql, options);
  } else if (isMetric(mbql)) {
    return formatMetric(mbql, options);
  } else if (isSegment(mbql)) {
    return formatSegment(mbql, options);
  } else if (isCase(mbql)) {
    return formatCase(mbql, options);
  }
  throw new Error("Unknown MBQL clause " + JSON.stringify(mbql));
}

function formatNumberLiteral(mbql) {
  return JSON.stringify(mbql);
}

function formatDimension(fieldRef, options) {
  const { query } = options;
  if (query) {
    const dimension = query.parseFieldReference(fieldRef);
    return formatDimensionName(dimension, options);
  } else {
    throw new Error("`query` is a required parameter to format expressions");
  }
}

function formatMetric([, metricId], options) {
  const { query } = options;
  const metric = _.findWhere(query.table().metrics, { id: metricId });
  if (!metric) {
    throw "metric with ID does not exist: " + metricId;
  }
  return formatMetricName(metric, options);
}

function formatSegment([, segmentId], options) {
  const { query } = options;
  const segment = _.findWhere(query.table().segments, { id: segmentId });
  if (!segment) {
    throw "segment with ID does not exist: " + segment;
  }
  return formatSegmentName(segment, options);
}

function formatFunction([fn, ...args], options) {
  if (hasOptions(args)) {
    // FIXME: how should we format args?
    args = args.slice(0, -1);
  }
  const formattedName = getExpressionName(fn);
  const formattedArgs = args.map(arg => format(arg, options));
  return args.length === 0
    ? formattedName
    : `${formattedName}(${formattedArgs.join(", ")})`;
}

function formatOperator([op, ...args], options) {
  if (hasOptions(args)) {
    // FIXME: how should we format args?
    args = args.slice(0, -1);
  }
  const formattedOperator = getExpressionName(op) || op;
  const formattedArgs = args.map(arg => {
    const isLowerPrecedence =
      isOperator(arg) && OPERATOR_PRECEDENCE[op] > OPERATOR_PRECEDENCE[arg[0]];
    return format(arg, { ...options, parens: isLowerPrecedence });
  });
  const clause = MBQL_CLAUSES[op];
  const formatted =
    clause && clause.args.length === 1
      ? // unary operator
        `${formattedOperator} ${formattedArgs[0]}`
      : formattedArgs.join(` ${formattedOperator} `);
  return options.parens ? `(${formatted})` : formatted;
}

function formatCase([_, clauses, caseOptions = {}], options) {
  const formattedName = getExpressionName("case");
  const formattedClauses = clauses
    .map(
      ([filter, mbql]) =>
        format(filter, options) + ", " + format(mbql, options),
    )
    .join(", ");
  const defaultExpression =
    caseOptions.default !== undefined
      ? ", " + format(caseOptions.default, options)
      : "";
  return `${formattedName}(${formattedClauses}${defaultExpression})`;
}
