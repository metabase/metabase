import _ from "underscore";

import {
  VALID_OPERATORS,
  VALID_AGGREGATIONS,
  isFieldReference,
  isMath,
  isMetric,
  isAggregation,
  formatMetricName,
  formatIdentifier,
} from "../expressions";

// convert a MBQL expression back into an expression string
export function format(
  expr,
  {
    query,
    operators = VALID_OPERATORS,
    aggregations = VALID_AGGREGATIONS,
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
    return formatLiteral(expr);
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
  throw new Error("Unknown expression " + JSON.stringify(expr));
}

function formatLiteral(expr) {
  return JSON.stringify(expr);
}

function formatFieldReference(fieldRef, { query }) {
  if (query) {
    return formatIdentifier(query.parseFieldReference(fieldRef).displayName());
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

function formatMath([operator, ...args], info, parens) {
  const formatted = args
    .map(arg => format(arg, info, true))
    .join(` ${operator} `);
  return parens ? `(${formatted})` : formatted;
}

function formatAggregation([aggregation, ...args], info) {
  const { aggregations } = info;
  return args.length === 0
    ? aggregations.get(aggregation)
    : `${aggregations.get(aggregation)}(${args
        .map(arg => format(arg, info))
        .join(", ")})`;
}
