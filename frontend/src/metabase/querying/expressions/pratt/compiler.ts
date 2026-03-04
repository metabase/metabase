import { t } from "ttag";

import { type NumberValue, parseNumber } from "metabase/lib/number";
import * as Lib from "metabase-lib";

import { getClauseDefinition, getMBQLName, isDefinedClause } from "../clause";
import { CompileError, isExpressionError } from "../errors";
import { isBigIntLiteral, isStringLiteral } from "../literal";
import type { Resolver } from "../resolver";
import type { ExpressionType } from "../types";
import { assert, check } from "../utils";

import type { Node, NodeType } from "./node";
import {
  ADD,
  ARG_LIST,
  BOOLEAN,
  CALL,
  COMPARISON,
  EQUALITY,
  FIELD,
  GROUP,
  IDENTIFIER,
  LOGICAL_AND,
  LOGICAL_NOT,
  LOGICAL_OR,
  MULDIV_OP,
  NEGATIVE,
  NUMBER,
  ROOT,
  STRING,
  SUB,
} from "./syntax";

type CompileFn = (
  node: Node,
  ctx: Context,
) => Lib.ExpressionParts | Lib.ExpressionArg;

type Options = {
  resolver?: Resolver | null;
  expressionMode: Lib.ExpressionMode;
};

type Context = {
  type: ExpressionType;
  resolver: Resolver;
};

export function compile(node: Node, options: Options) {
  return compileRoot(node, {
    type: getTypeForExpressionMode(options.expressionMode),
    resolver: options.resolver ?? fallbackResolver,
  });
}

function getTypeForExpressionMode(
  expressionMode: Lib.ExpressionMode,
): ExpressionType {
  if (expressionMode === "filter") {
    return "boolean";
  }
  return expressionMode;
}

function fallbackResolver(_type: ExpressionType, name: string, _node?: Node) {
  return {
    operator: "dimension" as Lib.ExpressionOperator,
    options: {},
    args: [name],
  };
}

function compileNode(
  node: Node,
  ctx: Context,
): Lib.ExpressionParts | Lib.ExpressionArg {
  const fn = COMPILE.get(node.type);
  assert(fn, t`Invalid node type: ${node.type}`);
  return fn(node, ctx);
}

function compileRoot(
  node: Node,
  ctx: Context,
):
  | Lib.ExpressionParts
  | Lib.ExpressionArg
  | Lib.ColumnMetadata
  | Lib.MeasureMetadata
  | Lib.MetricMetadata
  | Lib.SegmentMetadata {
  assert(node.type === ROOT, t`Must be root node`);
  assert(node.children.length === 1, t`Root must have one child`);

  const value = compileNode(node.children[0], ctx);

  // Bigints need to be wrapped in :value because they must be serialized as strings
  // and need type info to be parsed correctly
  if (isBigIntLiteral(value)) {
    return compileValue(value, "type/BigInteger");
  }

  // All other literals (strings, numbers, booleans) are returned as raw values.
  // This matches how filter clauses are created and allows the wrap-value-literals
  // QP middleware to add proper type info from the column being compared.
  return value;
}

function compileValue(
  value: string | boolean | number | bigint,
  type: string,
): Lib.ExpressionParts {
  return {
    operator: "value",
    options: { "base-type": type, "effective-type": type },
    args: [value],
  };
}

function compileField(
  node: Node,
  ctx: Context,
): Lib.ExpressionParts | Lib.ExpressionArg {
  assert(node.type === FIELD, t`Invalid node type`);
  assert(node.token?.value, t`Empty field value`);

  const name = node.token.value;
  return compileDimension(node, name, ctx);
}

function compileIdentifier(
  node: Node,
  ctx: Context,
): Lib.ExpressionParts | Lib.ExpressionArg {
  assert(node.type === IDENTIFIER, t`Invalid node type`);
  assert(node.token?.value, t`Empty token text`);

  const name = node.token.value;
  return compileDimension(node, name, ctx);
}

function compileDimension(
  node: Node,
  name: string,
  ctx: Context,
): Lib.ExpressionParts | Lib.ExpressionArg {
  assert(name, t`Empty dimension name`);
  try {
    const dimension = ctx.resolver(ctx.type, name, node);
    return withNode(node, dimension);
  } catch (err) {
    if (!isExpressionError(err) || !err.friendly) {
      throw err;
    }
    const operator = getMBQLName(name);
    const clause = operator && getClauseDefinition(operator);
    if (clause && clause.args.length === 0) {
      // Add custom error message for zero-arg functions to help users
      // that might be used to the no-parenthesis syntax which is no longer valid.
      throw new CompileError(t`${err.message}. Use ${name}() instead.`, node);
    }
    throw err;
  }
}

function compileGroup(
  node: Node,
  ctx: Context,
): Lib.ExpressionParts | Lib.ExpressionArg {
  assert(node.type === GROUP, t`Invalid node type`);
  assert(node.children.length === 1, t`Group must have one child`);

  return compileNode(node.children[0], ctx);
}

function compileString(node: Node): string {
  assert(node.type === STRING, t`Invalid node type`);
  assert(typeof node.token?.value === "string", t`No token text`);

  return node.token.value;
}

function compileLogicalNot(
  node: Node,
  ctx: Context,
): Lib.ExpressionParts | Lib.ExpressionArg {
  assert(node.type === LOGICAL_NOT, t`Invalid node type`);

  return compileUnaryOp("not", node, ctx);
}

function compileLogicalAnd(node: Node, ctx: Context): Lib.ExpressionParts {
  assert(node.type === LOGICAL_AND, t`Invalid node type`);

  return compileInfixOp("and", node, ctx);
}

function compileLogicalOr(node: Node, ctx: Context): Lib.ExpressionParts {
  assert(node.type === LOGICAL_OR, t`Invalid node type`);

  return compileInfixOp("or", node, ctx);
}

function compileComparisonOp(node: Node, ctx: Context): Lib.ExpressionParts {
  assert(node.type === COMPARISON, t`Invalid node type`);
  assert(node.token?.text, t`Empty token text`);
  assert(
    isDefinedClause(node.token.text),
    t`Invalid operator: ${node.token.text}`,
  );

  return compileInfixOp(node.token.text, node, ctx);
}

function compileEqualityOp(node: Node, ctx: Context): Lib.ExpressionParts {
  assert(node.type === EQUALITY, t`Invalid node type`);
  assert(node.token?.text, t`Empty token text`);
  assert(
    isDefinedClause(node.token.text),
    t`Invalid operator: ${node.token.text}`,
  );

  return compileInfixOp(node.token.text, node, ctx);
}

function compileFunctionCall(node: Node, ctx: Context): Lib.ExpressionParts {
  assert(node.type === CALL, t`Invalid node type`);
  assert(node.token?.text, t`Empty token text`);
  assert(
    node.children[0].type === ARG_LIST,
    t`First argument must be an arglist`,
  );

  const text = node.token?.text.trim().toLowerCase();
  const operator = getMBQLName(text) ?? text;

  check(isDefinedClause(operator), t`Unknown function ${operator}`, node);

  const args = compileArgList(node.children[0], operator, ctx);
  const options: Lib.ExpressionOptions = {};
  const clause = getClauseDefinition(operator);
  const hasOptions = clause?.hasOptions ?? false;

  if (hasOptions) {
    const last = args.at(-1);
    if (last === "include-current") {
      args.pop();
      options["include-current"] = true;
    }
    if (last === "case-insensitive") {
      args.pop();
      options["case-sensitive"] = false;
    }
    if (operator === "datetime" && args.length === 2) {
      args.pop();
      options["mode"] = compileDatetimeMode(node, last);
    }
  }

  return withNode(node, {
    operator,
    options,
    args,
  });
}

const DATETIME_MODE_MAP: Record<string, Lib.DatetimeMode> = {
  iso: "iso",
  simple: "simple",
  isobytes: "iso-bytes",
  simplebytes: "simple-bytes",
  unixseconds: "unix-seconds",
  unixmilliseconds: "unix-milliseconds",
  unixmicroseconds: "unix-microseconds",
  unixnanoseconds: "unix-nanoseconds",
};

function compileDatetimeMode(
  node: Node,
  mode: Lib.ExpressionParts | Lib.ExpressionArg | undefined,
): Lib.DatetimeMode {
  if (mode === undefined) {
    // default to iso
    return "iso";
  }

  check(isStringLiteral(mode), t`Expected string literal for mode`, node);

  return DATETIME_MODE_MAP[mode.toLowerCase().replaceAll("-", "")];
}

function compileArgList(
  node: Node,
  operator: Lib.ExpressionOperator,
  ctx: Context,
): (Lib.ExpressionParts | Lib.ExpressionArg)[] {
  assert(node.type === ARG_LIST, t`Invalid node type`);

  const defn = getClauseDefinition(operator);
  assert(defn, t`Unknown operator ${operator}`);

  return node.children.map((child, index) => {
    if (index >= defn.args.length && !defn.multiple) {
      // as-is, optional object for e.g. ends-with, time-interval, etc
      return withNode(child, compileNode(child, ctx));
    }

    const type = defn.argType(index, node.children, ctx.type);
    return withNode(child, compileNode(child, { ...ctx, type }));
  });
}

function compileNumber(node: Node): NumberValue | Lib.ExpressionParts {
  assert(node.type === NUMBER, t`Invalid node type`);
  assert(node.token?.text, t`No token text`);

  const number = parseNumber(node.token.text);
  check(number != null, t`Invalid number format`, node);

  if (typeof number === "bigint") {
    return withNode(node, compileValue(String(number), "type/BigInteger"));
  }

  return number;
}

function compileNegative(
  node: Node,
  ctx: Context,
): Lib.ExpressionParts | NumberValue {
  assert(node.type === NEGATIVE, t`Invalid node type`);

  const result = compileUnaryOp("-", node, ctx);
  if (typeof result.args[0] === "number") {
    return -result.args[0];
  }

  const arg = result.args[0];

  if (Lib.isExpressionParts(arg) && arg.operator === "value") {
    return negateValueClause(arg);
  }
  return result;
}

function negateValueClause(clause: Lib.ExpressionParts): Lib.ExpressionParts {
  assert(Lib.isExpressionParts(clause), t`Expected expression clause`);
  assert(clause.operator === "value", t`Expected value clause`);
  const { options, args } = clause;
  const [value] = args;

  if (typeof value === "number") {
    return {
      operator: "value",
      options,
      args: [-value],
    };
  }
  if (typeof value === "string") {
    const negated = value.startsWith("-") ? value.slice(1) : `-${value}`;
    return {
      operator: "value",
      options,
      args: [negated],
    };
  }
  assert(false, t`Expected number or string`);
}

function compileAdditionOp(node: Node, ctx: Context): Lib.ExpressionParts {
  assert(node.type === ADD, t`Invalid node type`);

  return compileInfixOp("+", node, ctx);
}

function compileMulDivOp(node: Node, ctx: Context): Lib.ExpressionParts {
  assert(node.type === MULDIV_OP, t`Invalid node type`);
  assert(node.token?.text, t`Empty token text`);
  assert(
    isDefinedClause(node.token.text),
    t`Invalid operator: ${node.token.text}`,
  );

  return compileInfixOp(node.token.text, node, ctx);
}

function compileSubtractionOp(node: Node, ctx: Context): Lib.ExpressionParts {
  assert(node.type === SUB, t`Invalid node type`);

  return compileInfixOp("-", node, ctx);
}

function compileBoolean(node: Node): boolean {
  assert(node.type === BOOLEAN, t`Invalid node type`);
  assert(node.token?.text, t`Empty token text`);

  const text = node.token.text.toLowerCase();
  return text === "true" ? true : false;
}

function compileUnaryOp(
  operator: Lib.ExpressionOperator,
  node: Node,
  ctx: Context,
): Lib.ExpressionParts {
  check(node.children.length > 0, t`Expected expression`, node);
  check(node.children.length < 2, t`Unexpected expression`, node.children[1]);

  assert(isDefinedClause(operator), t`Unknown operator ${operator}`);

  const defn = getClauseDefinition(operator);
  const type = defn.argType(0, node.children, ctx.type);
  const arg = compileNode(node.children[0], { ...ctx, type });

  return withNode(node, {
    operator,
    options: {},
    args: [arg],
  });
}

function compileInfixOp(
  operator: Lib.ExpressionOperator,
  node: Node,
  ctx: Context,
): Lib.ExpressionParts {
  check(node.children.length > 0, t`Expected expression`, node);
  check(node.children.length < 3, t`Unexpected expression`, node.children[2]);

  assert(isDefinedClause(operator), t`Unknown operator ${operator}`);

  const defn = getClauseDefinition(operator);
  const leftType = defn.argType(0, node.children, ctx.type);
  const rightType = defn.argType(1, node.children, ctx.type);

  const leftNode = compileNode(node.children[0], { ...ctx, type: leftType });
  const left =
    Lib.isExpressionParts(leftNode) && leftNode.operator === operator
      ? leftNode.args
      : [leftNode];

  const rightNode = compileNode(node.children[1], { ...ctx, type: rightType });
  const right = [rightNode];

  return withNode(node, {
    operator,
    options: {},
    args: [...left, ...right],
  });
}

function withNode<T>(node: Node, expressionParts: T): T {
  if (
    expressionParts != null &&
    typeof expressionParts === "object" &&
    !("node" in expressionParts)
  ) {
    Object.defineProperty(expressionParts, "node", {
      writable: false,
      enumerable: false,
      value: node,
    });
  }
  return expressionParts;
}

const COMPILE = new Map<NodeType, CompileFn>([
  [FIELD, compileField],
  [ADD, compileAdditionOp],
  [LOGICAL_AND, compileLogicalAnd],
  [CALL, compileFunctionCall],
  [EQUALITY, compileEqualityOp],
  [NUMBER, compileNumber],
  [BOOLEAN, compileBoolean],
  [LOGICAL_NOT, compileLogicalNot],
  [NEGATIVE, compileNegative],
  [LOGICAL_OR, compileLogicalOr],
  [COMPARISON, compileComparisonOp],
  [GROUP, compileGroup],
  [MULDIV_OP, compileMulDivOp],
  [STRING, compileString],
  [SUB, compileSubtractionOp],
  [IDENTIFIER, compileIdentifier],
]);
