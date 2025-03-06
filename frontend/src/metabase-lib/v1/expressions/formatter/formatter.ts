import type { AstPath, Doc, ParserOptions, Plugin } from "prettier";
import { builders } from "prettier/doc";
import { format as pformat } from "prettier/standalone";
import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import type {
  CallExpression,
  CallOptions,
  CaseOrIfExpression,
  Expression,
  FieldReference,
  MetricAgg,
  OffsetExpression,
  SegmentFilter,
} from "metabase-types/api";

import {
  type EDITOR_QUOTES,
  EXPRESSION_OPERATOR_WITHOUT_ORDER_PRIORITY,
  MBQL_CLAUSES,
  OPERATOR_PRECEDENCE,
  getExpressionName,
} from "../config";
import {
  formatDimensionName,
  formatIdentifier,
  formatMetricName,
  formatSegmentName,
} from "../identifier";
import { isFunction, isOperator, isOptionsObject } from "../matchers";
import { formatStringLiteral } from "../string";

import { pathMatchers as check } from "./utils";

export type FormatOptions = {
  query: Lib.Query;
  stageIndex: number;
  expressionIndex?: number | undefined;
  printWidth?: number;
  quotes?: typeof EDITOR_QUOTES;
};

export async function format(expression: Expression, options: FormatOptions) {
  // Format the AST as JSON because prettier expects a string
  // we parse the JSON into the AST as the first step
  return pformat(JSON.stringify(expression), {
    parser: PRETTIER_PLUGIN_NAME,
    plugins: [plugin(options)],
    printWidth: options.printWidth ?? 80,
  });
}

const PRETTIER_PLUGIN_NAME = "custom-expression";

// Set up a prettier plugin that formats expressions
function plugin(options: FormatOptions): Plugin<ExpressionNode> {
  return {
    languages: [
      {
        name: PRETTIER_PLUGIN_NAME,
        parsers: [PRETTIER_PLUGIN_NAME],
      },
    ],
    parsers: {
      [PRETTIER_PLUGIN_NAME]: {
        astFormat: PRETTIER_PLUGIN_NAME,
        parse(json: string) {
          // Parse the JSON string we get from the `format` function
          return JSON.parse(json);
        },
        locStart() {
          throw new Error("Not implemented");
        },
        locEnd() {
          throw new Error("Not implemented");
        },
      },
    },
    printers: {
      [PRETTIER_PLUGIN_NAME]: {
        preprocess(ast, opts) {
          opts.extra = options;
          return ast;
        },
        print,
      },
    },
  };
}

const {
  // prettier helpers
  join,
  indent,
  softline,
  line,
  group,
  ifBreak,
} = builders;

type ExpressionNode = Expression | CallOptions | undefined | null;
type Print = (path: AstPath<ExpressionNode>) => Doc;

function print(
  path: AstPath<Expression>,
  options: ParserOptions<ExpressionNode> & { extra: FormatOptions },
  print: Print,
): Doc {
  if (check.isEmpty(path)) {
    return "";
  } else if (check.isNumberLiteral(path)) {
    return formatNumberLiteral(path.node);
  } else if (check.isBooleanLiteral(path)) {
    return formatBooleanLiteral(path.node);
  } else if (check.isStringLiteral(path)) {
    return formatStringLiteral(path.node, options.extra);
  } else if (check.isOperator(path)) {
    return formatOperator(path, print);
  } else if (check.isOffset(path)) {
    return formatOffset(path, print);
  } else if (check.isFunction(path)) {
    return formatFunction(path, print);
  } else if (check.isDimension(path)) {
    return formatDimension(path, options.extra);
  } else if (check.isMetric(path)) {
    return formatMetric(path, options.extra);
  } else if (check.isSegment(path)) {
    return formatSegment(path, options.extra);
  } else if (check.isCaseOrIf(path)) {
    return formatCaseOrIf(path, print);
  } else if (check.isOptionsObject(path)) {
    return "";
  }

  throw new Error("Unknown MBQL clause " + JSON.stringify(path.node));
}

function formatNumberLiteral(node: number): Doc {
  return JSON.stringify(node);
}

function formatBooleanLiteral(node: boolean): Doc {
  return node ? "True" : "False";
}

function formatDimension(
  path: AstPath<FieldReference>,
  options: FormatOptions,
): Doc {
  const { query, stageIndex, expressionIndex } = options;

  if (!query) {
    throw new Error("`query` is a required parameter to format expressions");
  }

  const columns = Lib.expressionableColumns(query, stageIndex, expressionIndex);
  const [columnIndex] = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    [path.node],
  );

  const column = columns[columnIndex];
  if (!column) {
    return formatIdentifier(t`Unknown Field`, options);
  }

  const info = Lib.displayInfo(query, stageIndex, column);
  return formatDimensionName(info.longDisplayName, options);
}

function formatMetric(path: AstPath<MetricAgg>, options: FormatOptions): Doc {
  const [, metricId] = path.node;

  const { query, stageIndex } = options;

  if (!query) {
    throw new Error("`query` is a required parameter to format expressions");
  }

  const metric = Lib.availableMetrics(query, stageIndex).find(metric => {
    const [_type, availableMetricId] = Lib.legacyRef(query, stageIndex, metric);
    return availableMetricId === metricId;
  });

  if (!metric) {
    return formatIdentifier(t`Unknown Metric`, options);
  }

  const displayInfo = Lib.displayInfo(query, stageIndex, metric);
  return formatMetricName(displayInfo.displayName, options);
}

function formatSegment(path: AstPath<SegmentFilter>, options: FormatOptions) {
  const { stageIndex, query } = options;

  if (!query) {
    throw new Error("`query` is a required parameter to format expressions");
  }

  const [, segmentId] = path.node;
  const segment = Lib.availableSegments(query, stageIndex).find(segment => {
    const [_type, availableSegmentId] = Lib.legacyRef(
      query,
      stageIndex,
      segment,
    );

    return availableSegmentId === segmentId;
  });

  if (!segment) {
    return formatIdentifier(t`Unknown Segment`, options);
  }

  const displayInfo = Lib.displayInfo(query, stageIndex, segment);
  return formatSegmentName(displayInfo.displayName, options);
}

function formatFunctionOptions(options: CallOptions): Doc | null {
  // HACK: very specific to some string/time functions for now
  if (Object.prototype.hasOwnProperty.call(options, "case-sensitive")) {
    const caseSensitive = options["case-sensitive"];
    if (!caseSensitive) {
      return formatStringLiteral("case-insensitive");
    }
  }
  if (Object.prototype.hasOwnProperty.call(options, "include-current")) {
    const includeCurrent = options["include-current"];
    if (includeCurrent) {
      return formatStringLiteral("include-current");
    }
  }
  return null;
}

// Helper to recurse into an AST node that is not easily expressed as a
// property of the node currently in path.
// We will need this when switching to Lib.expressionParts, since the cljs
// objects can't be traversed natively by prettier.
function recurse<T, R>(
  path: AstPath<T>,
  callback: (path: AstPath<T>) => R,
  value: T,
): R {
  const { length } = path.stack;
  path.stack.push(value);
  try {
    return callback(path);
  } finally {
    path.stack.length = length;
  }
}

function formatFunction(path: AstPath<CallExpression>, print: Print): Doc {
  const { node } = path;
  if (!isFunction(node)) {
    throw new Error("Expected function");
  }
  if (!Array.isArray(node)) {
    throw new Error("Expected array");
  }

  const name = getExpressionName(node[0]) ?? "";
  let options: Doc | null = null;
  const args = node
    .map((arg: unknown, index: number) => {
      // the function name itself
      if (index === 0) {
        return null;
      }
      if (isOptionsObject(arg)) {
        options = formatFunctionOptions(arg);
        return null;
      }

      // Recursively format the arguments
      return recurse(path, print, node[index]);
    })
    .filter(isNotNull);

  if (options) {
    args.push(options);
  }

  if (args.length === 0) {
    return name;
  }

  return formatCallExpression(name, args);
}

function formatOperator(path: AstPath<CallExpression>, print: Print): Doc {
  const { node } = path;
  if (!Array.isArray(node)) {
    throw new Error("Expected array");
  }

  const [op] = node;
  const operator = getExpressionName(op) || op;

  const shouldPrefixOperator = isLogicOperator(operator);

  const args = node
    .map((arg, index) => {
      if (index === 0) {
        return null;
      }
      if (isOptionsObject(arg)) {
        // TODO: do we need to format this?
        return null;
      }

      let ln = index === 1 ? "" : line;
      if (shouldPrefixOperator) {
        ln = "";
      }

      function ind(doc: Doc) {
        if (index === 1 || shouldPrefixOperator) {
          return doc;
        }
        return indent(doc);
      }

      if (!isOperator(arg)) {
        // Not a call expression so not an operator
        return ind([ln, recurse(path, print, path.node[index])]);
      }

      if (!Array.isArray(arg)) {
        throw new Error("Expected array");
      }

      const argOperator = arg[0];
      const formattedArg = recurse(path, print, path.node[index]);

      const isLowerPrecedence =
        OPERATOR_PRECEDENCE[op] > OPERATOR_PRECEDENCE[argOperator];

      // "*","/" always have two arguments.
      // If the second argument of "/" is an expression, we have to calculate it first.
      // Hence, adding parenthesis.
      // "a / b * c" vs "a / (b * c)", "a / b / c" vs "a / (b / c)"
      // "a - b + c" vs "a - (b + c)", "a - b - c" vs "a - (b - c)"
      const isSamePrecedenceWithExecutionPriority =
        index > 1 &&
        OPERATOR_PRECEDENCE[op] === OPERATOR_PRECEDENCE[argOperator] &&
        !EXPRESSION_OPERATOR_WITHOUT_ORDER_PRIORITY.has(op);

      const shouldUseParens =
        isLowerPrecedence || isSamePrecedenceWithExecutionPriority;

      if (shouldUseParens) {
        return ind(
          group([
            ln,
            "(",
            group(
              ifBreak(
                [indent([softline, group(formattedArg)]), softline],
                formattedArg,
              ),
            ),
            ")",
          ]),
        );
      } else {
        return ind([ln, formattedArg]);
      }
    })
    .filter(isNotNull);

  if (isUnaryOperator(op)) {
    return [operator, " ", args[0]];
  }

  if (shouldPrefixOperator) {
    return group(join([line, operator, " "], args));
  } else {
    return group(join([" ", operator], args));
  }
}

function isLogicOperator(op: string) {
  return op === "AND" || op === "OR";
}

function isUnaryOperator(op: string) {
  const clause = MBQL_CLAUSES[op];
  return clause && clause?.args.length === 1;
}

function formatCaseOrIf(path: AstPath<CaseOrIfExpression>, print: Print): Doc {
  const { node } = path;
  if (!Array.isArray(node)) {
    throw new Error("Expected array");
  }

  const name = getExpressionName(node[0]) ?? "";
  const args = node
    .map((arg, index) => {
      if (index === 0) {
        return null;
      }

      if (index === 1) {
        // clause
        if (!Array.isArray(arg)) {
          return null;
        }

        return arg
          .map((_clause, clauseIndex) => {
            return [
              recurse(path, print, path.node[index][clauseIndex][0]),
              recurse(path, print, path.node[index][clauseIndex][1]),
            ];
          })
          .flat();
      }

      if (index === 2) {
        // options
        if (isOptionsObject(arg) && "default" in arg) {
          return recurse(path, print, path.node[index]?.["default"]);
        }

        return null;
      }

      throw new Error("more args than expected");
    })
    .flat()
    .filter(isNotNull);

  return formatCallExpression(name, args);
}

function formatOffset(path: AstPath<OffsetExpression>, print: Print): Doc {
  const name = getExpressionName("offset") ?? "";
  const expr = recurse(path, print, path.node[2]);
  const n = recurse(path, print, path.node[3]);

  const args = [expr, n];

  return formatCallExpression(name, args);
}

function formatCallExpression(callee: string, args: Doc[]): Doc {
  // render a call expression as
  //
  //   callee(arg1, arg2, ...)
  //
  // or, when not enough space
  //
  //   callee(
  //     arg1,
  //     arg2,
  //     ...
  //   )
  return group([
    callee,
    "(",
    indent([
      // indent args
      softline,
      join([",", line], args),
    ]),
    softline,
    ")",
  ]);
}
