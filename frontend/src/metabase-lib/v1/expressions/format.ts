import _ from "underscore";

import * as Lib from "metabase-lib";
import type { FieldReference, Filter } from "metabase-types/api";

import {
  EXPRESSION_OPERATOR_WITHOUT_ORDER_PRIORITY,
  MBQL_CLAUSES,
  OPERATOR_PRECEDENCE,
  formatDimensionName,
  formatMetricName,
  formatSegmentName,
  formatStringLiteral,
  getExpressionName,
  hasOptions,
  isBooleanLiteral,
  isCase,
  isDimension,
  isFunction,
  isMetric,
  isNumberLiteral,
  isOffset,
  isOperator,
  isSegment,
  isStringLiteral,
} from "./index";

export { DISPLAY_QUOTES, EDITOR_QUOTES } from "./config";

type Options = {
  startRule: string;
  [key: string]: any;
} & {
  query: Lib.Query;
  stageIndex: number;
  expressionIndex: number | undefined;
};

// convert a MBQL expression back into an expression string
// It is hard to provide correct types here, so we have to use any
export function format(mbql: any, options: Options): string {
  if (mbql == null || _.isEqual(mbql, [])) {
    return "";
  } else if (isNumberLiteral(mbql)) {
    return formatNumberLiteral(mbql);
  } else if (isBooleanLiteral(mbql)) {
    return formatBooleanLiteral(mbql);
  } else if (isStringLiteral(mbql)) {
    return formatStringLiteral(mbql, options);
  } else if (isOperator(mbql)) {
    return formatOperator(mbql, options);
  } else if (isOffset(mbql)) {
    return formatOffset(mbql, options);
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

function formatBooleanLiteral(mbql: unknown) {
  return mbql ? "True" : "False";
}

function formatNumberLiteral(mbql: unknown) {
  return JSON.stringify(mbql);
}

function formatDimension(fieldRef: FieldReference, options: Options) {
  const { query, stageIndex, expressionIndex } = options;

  if (!query) {
    throw new Error("`query` is a required parameter to format expressions");
  }

  const columns = Lib.expressionableColumns(query, stageIndex, expressionIndex);
  const [columnIndex] = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    [fieldRef],
  );
  const column = columns[columnIndex];

  return column
    ? formatDimensionName(
        Lib.displayInfo(query, stageIndex, column).longDisplayName,
        options,
      )
    : "";
}

function formatMetric([, metricId]: FieldReference, options: Options) {
  const { query, stageIndex } = options;

  if (!query) {
    throw new Error("`query` is a required parameter to format expressions");
  }

  const metric = Lib.availableMetrics(query, stageIndex).find(metric => {
    const [_, availableMetricId] = Lib.legacyRef(query, stageIndex, metric);

    return availableMetricId === metricId;
  });

  if (!metric) {
    throw new Error(`metric with ID: ${metricId} does not exist`);
  }

  const displayInfo = Lib.displayInfo(query, stageIndex, metric);

  return formatMetricName(displayInfo.displayName, options);
}

function formatSegment([, segmentId]: FieldReference, options: Options) {
  const { stageIndex, query } = options;

  if (!query) {
    throw new Error("`query` is a required parameter to format expressions");
  }

  const segment = Lib.availableSegments(query, stageIndex).find(segment => {
    const [_, availableSegmentId] = Lib.legacyRef(query, stageIndex, segment);

    return availableSegmentId === segmentId;
  });

  if (!segment) {
    throw new Error("segment with ID does not exist: " + segmentId);
  }

  const displayInfo = Lib.displayInfo(query, stageIndex, segment);

  return formatSegmentName(displayInfo.displayName, options);
}

// HACK: very specific to some string/time functions for now
function formatFunctionOptions(fnOptions: Record<string, any>) {
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

function formatFunction([fn, ...args]: any[], options: Options) {
  if (hasOptions(args)) {
    const fnOptions = formatFunctionOptions(args.pop());
    if (fnOptions) {
      args = [...args, fnOptions];
    }
  }
  const formattedName = getExpressionName(fn) ?? "";
  const formattedArgs = args.map(arg => format(arg, options));
  return args.length === 0
    ? formattedName
    : `${formattedName}(${formattedArgs.join(", ")})`;
}

function formatOperator([op, ...args]: any[], options: Options) {
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

function formatCase([_, clauses, caseOptions = {}]: any[], options: Options) {
  const formattedName = getExpressionName("case");
  const formattedClauses = clauses
    .map(
      ([filter, mbql]: any[]) =>
        format(filter, options) + ", " + format(mbql, options),
    )
    .join(", ");
  const defaultExpression =
    caseOptions.default !== undefined
      ? ", " + format(caseOptions.default, options)
      : "";
  return `${formattedName}(${formattedClauses}${defaultExpression})`;
}

function formatOffset([_tag, _opts, expr, n]: any[], options: Options) {
  const formattedName = getExpressionName("offset");
  const formattedExpr = format(expr, options);

  return `${formattedName}(${formattedExpr}, ${n})`;
}

const NEGATIVE_FILTERS: Record<string, string> = {
  "does-not-contain": "contains",
  "not-empty": "is-empty",
  "not-null": "is-null",
};

function isNegativeFilter(expr: Filter) {
  if (!Array.isArray(expr)) {
    return false;
  }

  const [fn, ...args] = expr;
  return typeof NEGATIVE_FILTERS[fn] === "string" && args.length >= 1;
}

function formatNegativeFilter(mbql: Filter, options: Options) {
  const [fn, ...args] = mbql;
  const baseFn = NEGATIVE_FILTERS[fn];
  return "NOT " + format([baseFn, ...args], options);
}
