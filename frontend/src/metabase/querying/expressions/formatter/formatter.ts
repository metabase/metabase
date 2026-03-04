import type { AstPath, Doc, ParserOptions, Plugin } from "prettier";
import { builders } from "prettier/doc";
import { format as pformat } from "prettier/standalone";

import { parseNumber } from "metabase/lib/number";
import * as Lib from "metabase-lib";
import { isa } from "metabase-lib/v1/types/utils/isa";

import { getClauseDefinition } from "../clause";
import {
  formatDimensionName,
  formatIdentifier,
  formatMetricName,
  formatSegmentName,
} from "../identifier";
import { parsePunctuator } from "../punctuator";
import { type StartDelimiter, formatStringLiteral } from "../string";

import {
  pathMatchers as check,
  isDimensionOperator,
  isExpressionOperator,
  isValueOperator,
} from "./utils";

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
  availableColumns?: Lib.ColumnMetadata[];
  printWidth?: number;
  stringDelimiter?: StartDelimiter;
};

export async function formatExpressionParts(
  root: Lib.ExpressionParts | Lib.ExpressionArg,
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
    return formatStringLiteral(path.node, options.extra.stringDelimiter);
  } else if (check.isColumnMetadata(path)) {
    return formatColumn(path, options.extra);
  } else if (check.isMetricMetadata(path)) {
    return formatMetric(path, options.extra);
  } else if (check.isMeasureMetadata(path)) {
    return formatMeasure(path, options.extra);
  } else if (check.isSegmentMetadata(path)) {
    return formatSegment(path, options.extra);
  } else if (check.isExpressionOperator(path)) {
    return formatOperator(path, print);
  } else if (check.isDimensionOperator(path)) {
    return formatDimension(path);
  } else if (check.isValueOperator(path)) {
    return formatValueExpression(path, print);
  } else if (check.isExpressionParts(path)) {
    return formatFunctionCall(path, print);
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
  return formatDimensionName(info.longDisplayName);
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
  return formatMetricName(displayInfo.displayName);
}

function formatMeasure(
  path: AstPath<Lib.MeasureMetadata>,
  options: FormatOptions,
): Doc {
  const metric = path.node;
  const { query, stageIndex } = options;

  assert(query !== undefined, "Expected query");
  assert(typeof stageIndex === "number", "Expected stageIndex");
  assert(Lib.isMeasureMetadata(metric), "Expected measure");

  const displayInfo = Lib.displayInfo(query, stageIndex, metric);
  return formatMetricName(displayInfo.displayName);
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
  return formatSegmentName(displayInfo.displayName);
}

function formatDimension(path: AstPath<Lib.ExpressionParts>): Doc {
  const { node } = path;
  assert(isDimensionOperator(node), "Expected dimension");

  const name = node.args[0];
  assert(typeof name === "string", "Expected expression name to be a string");

  return formatIdentifier(name);
}

function formatFunctionCall(
  path: AstPath<Lib.ExpressionParts>,
  print: Print,
): Doc {
  const { node } = path;

  const args = node.args.map((arg: ExpressionNode) =>
    recurse(path, print, arg),
  );

  const options = formatExpressionOptions(node.options);
  if (options) {
    args.push(options);
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
    displayName(node.operator),
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

function formatExpressionOptions(options: Lib.ExpressionOptions): Doc | null {
  if ("case-sensitive" in options && !options["case-sensitive"]) {
    return formatStringLiteral("case-insensitive");
  }
  if ("include-current" in options && options["include-current"]) {
    return formatStringLiteral("include-current");
  }
  if ("mode" in options && options.mode) {
    const camelCased = options.mode.replace(/-\w/g, (match) =>
      match.charAt(1).toUpperCase(),
    );
    return formatStringLiteral(camelCased);
  }
  return null;
}

function formatOperator(path: AstPath<Lib.ExpressionParts>, print: Print): Doc {
  const { node } = path;

  assert(
    isExpressionOperator(node),
    `Expected operator but got ${node.operator}`,
  );

  const operatorGoesOnNewline =
    node.operator === "and" || node.operator === "or";

  const args = node.args.map((arg, index) => {
    const ln = index === 0 || operatorGoesOnNewline ? "" : line;

    function ind(doc: Doc) {
      if (index === 0 || operatorGoesOnNewline) {
        return doc;
      }
      return indent(doc);
    }

    if (
      !Lib.isExpressionParts(arg) ||
      isValueOperator(arg) ||
      isDimensionOperator(arg)
    ) {
      // Not a call expression so not an operator
      return ind([ln, recurse(path, print, path.node.args[index])]);
    }

    const argOperator = arg.operator;
    const formattedArg = recurse(path, print, path.node.args[index]);

    const operatorPrecedence = precedence(node.operator);
    const argPrecedence = precedence(argOperator);

    const isLowerPrecedence = operatorPrecedence > argPrecedence;
    const isSamePrecedence = operatorPrecedence === argPrecedence;

    // "*","/" always have two arguments.
    // If the second argument of "/" is an expression, we have to calculate it first.
    // Hence, adding parenthesis.
    // "a / b * c" vs "a / (b * c)", "a / b / c" vs "a / (b / c)"
    // "a - b + c" vs "a - (b + c)", "a - b - c" vs "a - (b - c)"
    const isSamePrecedenceWithExecutionPriority = index > 0 && isSamePrecedence;

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

  if (operatorGoesOnNewline) {
    return group(join([line, displayName(node.operator), " "], args));
  } else {
    return group(join([" ", displayName(node.operator)], args));
  }
}

function precedence(op: string): number {
  return parsePunctuator(op)?.precedence ?? Infinity;
}

function isUnaryOperator(op: Lib.ExpressionOperator) {
  return getClauseDefinition(op)?.args.length === 1;
}

function formatValueExpression(
  path: AstPath<Lib.ExpressionParts>,
  print: Print,
): Doc {
  const { node } = path;

  assert(isValueOperator(node), "Expected value");

  const {
    args: [value],
    options,
  } = node;

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

function displayName(name: Lib.ExpressionOperator): string {
  assert(name !== "value", "Unexpected value clause");
  return getClauseDefinition(name)?.displayName ?? name;
}
