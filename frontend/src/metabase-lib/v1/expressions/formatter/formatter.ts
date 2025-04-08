import type { AstPath, Doc, ParserOptions, Plugin } from "prettier";
import { builders } from "prettier/doc";
import { format as pformat } from "prettier/standalone";

import { parseNumber } from "metabase/lib/number";
import * as Lib from "metabase-lib";
import { isa } from "metabase-lib/v1/types/utils/isa";

import {
  type EDITOR_QUOTES,
  EXPRESSION_OPERATOR_WITHOUT_ORDER_PRIORITY,
  FIELD_MARKERS,
  OPERATORS,
  OPERATOR_PRECEDENCE,
  getClauseDefinition,
  getExpressionName,
} from "../config";
import {
  formatDimensionName,
  formatIdentifier,
  formatMetricName,
  formatSegmentName,
} from "../identifier";
import { formatStringLiteral } from "../string";
import type { OPERATOR } from "../tokenizer";

import { pathMatchers as check } from "./utils";

export type ExpressionNode = Lib.ExpressionParts | Lib.ExpressionArg | null;

export type FormatClauseOptions = {
  query: Lib.Query;
  stageIndex: number;
} & FormatOptions;

export async function format(
  expression: Lib.Expressionable,
  options: FormatClauseOptions,
) {
  // prettier expects us to pass a string, but we have the AST already
  // so we pass a bogus string and ignore it. The actual ast is passed via
  // the root option.
  const { query, stageIndex } = options;
  const parts = Lib.expressionParts(query, stageIndex, expression);
  return formatExpressionParts(parts, options);
}

type FormatOptions = {
  query?: Lib.Query;
  stageIndex?: number;
  expressionIndex?: number | undefined;
  printWidth?: number;
  delimiters?: typeof EDITOR_QUOTES;
};

export async function formatExpressionParts(
  root: Lib.ExpressionParts,
  options: FormatOptions = {},
) {
  // prettier expects us to pass a string, but we have the AST already
  // so we pass a bogus string and ignore it. The actual ast is passed via
  // the root option.
  return pformat("__not_used__", {
    parser: PRETTIER_PLUGIN_NAME,
    plugins: [plugin({ ...options, root })],
    printWidth: options.printWidth ?? 80,
  });
}

const PRETTIER_PLUGIN_NAME = "custom-expression";

type InternalOptions = {
  root: ExpressionNode;
};

// Set up a prettier plugin that formats expressions
function plugin(
  options: FormatOptions & InternalOptions,
): Plugin<ExpressionNode> {
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
        parse() {
          return options.root;
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

type Print = (path: AstPath<ExpressionNode>) => Doc;

function print(
  path: AstPath<ExpressionNode>,
  options: ParserOptions<ExpressionNode> & { extra: FormatOptions },
  print: Print,
): Doc {
  if (path.node === null) {
    return "";
  } else if (check.isNumberLiteral(path)) {
    return formatNumberLiteral(path.node);
  } else if (check.isBooleanLiteral(path)) {
    return formatBooleanLiteral(path.node);
  } else if (check.isStringLiteral(path)) {
    return formatStringLiteral(path.node, options.extra);
  } else if (check.isColumnMetadata(path)) {
    return formatColumn(path, options.extra);
  } else if (check.isMetricMetadata(path)) {
    return formatMetric(path, options.extra);
  } else if (check.isSegmentMetadata(path)) {
    return formatSegment(path, options.extra);
  } else if (check.isExpressionParts(path)) {
    if (isOperator(path.node.operator)) {
      return formatOperator(path, print);
    } else if (isExpression(path.node.operator)) {
      return formatExpression(path);
    } else if (isDimension(path.node.operator)) {
      return formatDimension(path);
    } else if (isValueOperator(path.node.operator)) {
      return formatValueExpression(path, print);
    } else {
      return formatFunctionCall(path, print);
    }
  }

  throw new Error(`Unknown MBQL clause: ${JSON.stringify(path.node)}`);
}

// Helper to recurse into an AST node that is not easily expressed as a
// property of the node currently in path.
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

function formatNumberLiteral(node: number | bigint): Doc {
  return String(node);
}

function formatBooleanLiteral(node: boolean): Doc {
  return node ? "True" : "False";
}

function assert(condition: any, msg: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}

function formatColumn(
  path: AstPath<Lib.ColumnMetadata>,
  options: FormatOptions,
): Doc {
  const { query, stageIndex } = options;
  const column = path.node;

  assert(query !== undefined, "Expected query");
  assert(typeof stageIndex === "number", "Expected stageIndex");
  assert(Lib.isColumnMetadata(column), "Expected column");

  const info = Lib.displayInfo(query, stageIndex, column);
  return formatDimensionName(info.longDisplayName, options);
}

function formatMetric(
  path: AstPath<Lib.MetricMetadata>,
  options: FormatOptions,
): Doc {
  const metric = path.node;
  const { query, stageIndex } = options;

  assert(query !== undefined, "Expected query");
  assert(typeof stageIndex === "number", "Expected stageIndex");
  assert(Lib.isMetricMetadata(metric), "Expected metric");

  const displayInfo = Lib.displayInfo(query, stageIndex, metric);
  return formatMetricName(displayInfo.displayName, options);
}

function formatSegment(
  path: AstPath<Lib.SegmentMetadata>,
  options: FormatOptions,
) {
  const segment = path.node;
  const { query, stageIndex } = options;

  assert(query !== undefined, "Expected query");
  assert(typeof stageIndex === "number", "Expected stageIndex");
  assert(Lib.isSegmentMetadata(segment), "Expected segment");

  const displayInfo = Lib.displayInfo(query, stageIndex, segment);
  return formatSegmentName(displayInfo.displayName, options);
}

function isExpression(op: string): op is "expression" {
  return op === "expression";
}

function formatExpression(path: AstPath<Lib.ExpressionParts>): Doc {
  const { node } = path;

  assert(isExpression(node.operator), "Expected expression");
  const name = node.args[0];

  assert(typeof name === "string", "Expected expression name to be a string");

  return formatIdentifier(name);
}

function isDimension(op: string): op is "dimension" {
  return op === "dimension";
}

function formatDimension(path: AstPath<Lib.ExpressionParts>): Doc {
  const { node } = path;
  assert(isDimension(node.operator), "Expected dimension");

  const name = node.args[0];
  assert(typeof name === "string", "Expected expression name to be a string");

  return formatIdentifier(name);
}

function formatFunctionCall(
  path: AstPath<Lib.ExpressionParts>,
  print: Print,
): Doc {
  const { node } = path;
  const name = node.operator;

  const args = node.args.map((arg: ExpressionNode) =>
    recurse(path, print, arg),
  );

  const options = formatExpressionOptions(node.options);
  if (options) {
    args.push(options);
  }

  return formatCallExpression(name, args);
}

function formatExpressionOptions(options: Lib.ExpressionOptions): Doc | null {
  if ("case-sensitive" in options && !options["case-sensitive"]) {
    return formatStringLiteral("case-insensitive");
  }
  if ("include-current" in options && options["include-current"]) {
    return formatStringLiteral("include-current");
  }
  return null;
}

function isOperator(operator: string): operator is OPERATOR {
  return OPERATORS.has(operator as OPERATOR);
}

function formatOperator(path: AstPath<Lib.ExpressionParts>, print: Print): Doc {
  const { node } = path;

  assert(
    isOperator(node.operator),
    `Expected operator but got ${node.operator}`,
  );

  const shouldPrefixOperator = isLogicOperator(node.operator);

  const args = node.args.map((arg, index) => {
    const ln = index === 0 || shouldPrefixOperator ? "" : line;

    function ind(doc: Doc) {
      if (index === 0 || shouldPrefixOperator) {
        return doc;
      }
      return indent(doc);
    }

    if (
      !Lib.isExpressionParts(arg) ||
      isValueOperator(arg.operator) ||
      FIELD_MARKERS.has(arg.operator)
    ) {
      // Not a call expression so not an operator
      return ind([ln, recurse(path, print, path.node.args[index])]);
    }

    const argOperator = arg.operator;
    const formattedArg = recurse(path, print, path.node.args[index]);

    const isLowerPrecedence =
      OPERATOR_PRECEDENCE[node.operator] > OPERATOR_PRECEDENCE[argOperator];

    // "*","/" always have two arguments.
    // If the second argument of "/" is an expression, we have to calculate it first.
    // Hence, adding parenthesis.
    // "a / b * c" vs "a / (b * c)", "a / b / c" vs "a / (b / c)"
    // "a - b + c" vs "a - (b + c)", "a - b - c" vs "a - (b - c)"
    const isSamePrecedenceWithExecutionPriority =
      index > 0 &&
      OPERATOR_PRECEDENCE[node.operator] === OPERATOR_PRECEDENCE[argOperator] &&
      !EXPRESSION_OPERATOR_WITHOUT_ORDER_PRIORITY.has(node.operator);

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
  });

  if (isUnaryOperator(node.operator)) {
    return [displayName(node.operator), " ", args[0]];
  }

  if (shouldPrefixOperator) {
    return group(join([line, displayName(node.operator), " "], args));
  } else {
    return group(join([" ", displayName(node.operator)], args));
  }
}

function isLogicOperator(op: string) {
  return op === "and" || op === "or";
}

function isUnaryOperator(op: string) {
  const clause = getClauseDefinition(op);
  return clause && clause?.args.length === 1;
}

function isValueOperator(op: string): op is "value" {
  return op === "value";
}

function formatValueExpression(
  path: AstPath<Lib.ExpressionParts>,
  print: Print,
): Doc {
  const { node } = path;
  const {
    operator,
    args: [value],
    options,
  } = node;

  assert(isValueOperator(operator), "Expected value");

  const baseType = options?.["base-type"];
  if (
    typeof value === "string" &&
    typeof baseType === "string" &&
    isa(baseType, "type/BigInteger")
  ) {
    const number = parseNumber(value);
    if (number != null) {
      return recurse(path, print, number);
    }
  }
  return recurse(path, print, node.args[0]);
}

function formatCallExpression(callee: string, args: Doc[]): Doc {
  // If there are no arguments, render just the name
  if (args.length === 0) {
    return displayName(callee);
  }

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
    displayName(callee),
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

/**
 * Format the name of an expression clause.
 */
function displayName(name: string): string {
  return getExpressionName(name) ?? name;
}
