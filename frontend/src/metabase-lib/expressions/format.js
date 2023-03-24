import _ from "underscore";

import {
  MBQL_CLAUSES,
  OPERATOR_PRECEDENCE,
  isNumberLiteral,
  isBooleanLiteral,
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
  EXPRESSION_OPERATOR_WITHOUT_ORDER_PRIORITY,
} from "./index";

export { DISPLAY_QUOTES, EDITOR_QUOTES } from "./config";

// convert a MBQL expression back into an expression string
export function format(mbql, options = {}) {
  if (mbql == null || _.isEqual(mbql, [])) {
    return "";
  } else if (isNumberLiteral(mbql)) {
    return formatNumberLiteral(mbql, options);
  } else if (isBooleanLiteral(mbql)) {
    return formatBooleanLiteral(mbql, options);
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
  } else if (isNegativeFilter(mbql)) {
    return formatNegativeFilter(mbql, options);
  }
  throw new Error("Unknown MBQL clause " + JSON.stringify(mbql));
}

function formatBooleanLiteral(mbql) {
  return mbql ? "True" : "False";
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

// HACK: very specific to some string/time functions for now
function formatFunctionOptions(fnOptions) {
  if (Object.prototype.hasOwnProperty.call(fnOptions, "case-sensitive")) {
    const caseSensitive = fnOptions["case-sensitive"];
    if (!caseSensitive) {
      return "case-insensitive";
    }
  }
  if (Object.prototype.hasOwnProperty.call(fnOptions, "include-current")) {
    const includeCurrent = fnOptions["include-current"];
    if (includeCurrent) {
      return "include-current";
    }
  }
}

function formatFunction([fn, ...args], options) {
  if (hasOptions(args)) {
    const fnOptions = formatFunctionOptions(args.pop());
    if (fnOptions) {
      args = [...args, fnOptions];
    }
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
  const formattedArgs = args.map((arg, index) => {
    const argOp = isOperator(arg) && arg[0];
    const isLowerPrecedence =
      isOperator(arg) && OPERATOR_PRECEDENCE[op] > OPERATOR_PRECEDENCE[argOp];

    // "*","/" always have two arguments. If the second argument of "/" is an expression, we have to calculate it first.
    // Hence, adding parenthesis.
    // "a / b * c" vs "a / (b * c)", "a / b / c" vs "a / (b / c)"
    // "a - b + c" vs "a - (b + c)", "a - b - c" vs "a - (b - c)"
    const isSamePrecedenceWithExecutionPriority =
      index > 0 &&
      isOperator(arg) &&
      OPERATOR_PRECEDENCE[op] === OPERATOR_PRECEDENCE[argOp] &&
      !EXPRESSION_OPERATOR_WITHOUT_ORDER_PRIORITY.has(op);

    return format(arg, {
      ...options,
      parens: isLowerPrecedence || isSamePrecedenceWithExecutionPriority,
    });
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

const NEGATIVE_FILTERS = {
  "does-not-contain": "contains",
  "not-empty": "is-empty",
  "not-null": "is-null",
};

function isNegativeFilter(expr) {
  const [fn, ...args] = expr;
  return typeof NEGATIVE_FILTERS[fn] === "string" && args.length >= 1;
}

function formatNegativeFilter(mbql, options) {
  const [fn, ...args] = mbql;
  const baseFn = NEGATIVE_FILTERS[fn];
  return "NOT " + format([baseFn, ...args], options);
}
