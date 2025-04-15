import { t } from "ttag";

import { type NumberValue, parseNumber } from "metabase/lib/number";
import * as Lib from "metabase-lib";

import { getMBQLName as defaultGetMBQLName } from "../config";
import { CompileError } from "../errors";

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
import { type Node, type NodeType, assert } from "./types";

export type CompileOptions = {
  getMBQLName?: (expressionName: string) => string | undefined;
};

type Options = Required<CompileOptions>;
type CompileFn = (
  node: Node,
  opts: Options,
) => Lib.ExpressionParts | Lib.ExpressionArg;

export function compile(
  node: Node,
  { getMBQLName = defaultGetMBQLName }: CompileOptions = {},
): Lib.ExpressionParts | Lib.ExpressionArg {
  assert(node.type === ROOT, "Must be root node");
  return compileUnaryOp(node, { getMBQLName });
}

function compileNode(
  node: Node,
  opts: Options,
): Lib.ExpressionParts | Lib.ExpressionArg {
  const fn = COMPILE.get(node.type);
  if (!fn) {
    throw new CompileError(t`Invalid node type`, { node, token: node.token });
  }
  return fn(node, opts);
}

function compileField(node: Node): Lib.ExpressionParts {
  assert(node.type === FIELD, "Invalid Node Type");
  assert(node.token?.text, "Empty field name");
  assert(node.token?.value, "Empty field value");

  return withNode(node, {
    // TODO: remove this cast
    operator: "dimension" as Lib.ExpressionOperator,
    options: {},
    args: [node.token.value],
  });
}

function compileIdentifier(node: Node): Lib.ExpressionParts {
  assert(node.type === IDENTIFIER, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  const name = node.token.text;
  return withNode(node, {
    // TODO: remove this cast
    operator: "dimension" as Lib.ExpressionOperator,
    options: {},
    args: [name],
  });
}

function compileGroup(
  node: Node,
  opts: Options,
): Lib.ExpressionParts | Lib.ExpressionArg {
  assert(node.type === GROUP, "Invalid Node Type");
  return compileUnaryOp(node, opts);
}

function compileString(node: Node): string {
  assert(node.type === STRING, "Invalid Node Type");
  assert(typeof node.token?.value === "string", "No token text");
  return node.token.value;
}

function compileLogicalNot(
  node: Node,
  opts: Options,
): Lib.ExpressionParts | Lib.ExpressionArg {
  assert(node.type === LOGICAL_NOT, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  return withNode(node, {
    // TODO: remove this cast
    operator: "not" as Lib.ExpressionOperator,
    options: {},
    args: [compileUnaryOp(node, opts)],
  });
}

function compileLogicalAnd(node: Node, opts: Options): Lib.ExpressionParts {
  assert(node.type === LOGICAL_AND, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  const [left, right] = compileInfixOp(node, opts);
  return withNode(node, {
    // TODO: remove this cast
    operator: "and" as Lib.ExpressionOperator,
    options: {},
    args: [...left, ...right],
  });
}

function compileLogicalOr(node: Node, opts: Options): Lib.ExpressionParts {
  assert(node.type === LOGICAL_OR, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  const [left, right] = compileInfixOp(node, opts);
  return withNode(node, {
    // TODO: remove this cast
    operator: "or" as Lib.ExpressionOperator,
    options: {},
    args: [...left, ...right],
  });
}

function compileComparisonOp(node: Node, opts: Options): Lib.ExpressionParts {
  assert(node.type === COMPARISON, "Invalid Node Type");
  const operator = node.token?.text;
  assert(operator, "Empty token operator");
  const [left, right] = compileInfixOp(node, opts);
  return withNode(node, {
    // TODO: remove this cast
    operator: operator as Lib.ExpressionOperator,
    options: {},
    args: [...left, ...right],
  });
}

function compileEqualityOp(node: Node, opts: Options): Lib.ExpressionParts {
  assert(node.type === EQUALITY, "Invalid Node Type");
  const operator = node.token?.text;
  assert(operator, "Empty token operator");
  const [left, right] = compileInfixOp(node, opts);
  return withNode(node, {
    operator: operator as Lib.ExpressionOperator,
    options: {},
    args: [...left, ...right],
  });
}

function compileFunctionCall(node: Node, opts: Options): Lib.ExpressionParts {
  assert(node.type === CALL, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  assert(
    node.children[0].type === ARG_LIST,
    "First argument must be an arglist",
  );
  const name = node.token?.text.trim().toLowerCase();
  const fn = opts.getMBQLName(name);
  return withNode(node, {
    // TODO: remove this cast
    operator: (fn ? fn : name) as Lib.ExpressionOperator,
    options: {},
    args: compileArgList(node.children[0], opts),
  });
}

function compileArgList(
  node: Node,
  opts: Options,
): (Lib.ExpressionParts | Lib.ExpressionArg)[] {
  assert(node.type === ARG_LIST, "Invalid Node Type");
  return node.children.map((child) => {
    const expr = compileNode(child, opts);
    return (expr as any).node ? expr : withNode(child, expr);
  });
}

function compileNumber(node: Node): NumberValue {
  assert(node.type === NUMBER, "Invalid Node Type");
  assert(typeof node.token?.text === "string", "No token text");

  const number = parseNumber(node.token.text);
  if (number == null) {
    throw new CompileError(t`Invalid number format`, {
      node,
      token: node.token,
    });
  }

  // TODO: handle bigint by wrapping it in :value?

  return number;
}

function compileNegative(
  node: Node,
  opts: Options,
): Lib.ExpressionParts | NumberValue {
  assert(node.type === NEGATIVE, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  const arg = compileUnaryOp(node, opts);
  if (typeof arg === "number") {
    return -arg;
  }
  return withNode(node, {
    operator: "-",
    options: {},
    args: [arg],
  });
}

function compileAdditionOp(node: Node, opts: Options): Lib.ExpressionParts {
  assert(node.type === ADD, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  const [left, right] = compileInfixOp(node, opts);
  return withNode(node, {
    operator: "+",
    options: {},
    args: [...left, ...right],
  });
}

function compileMulDivOp(node: Node, opts: Options): Lib.ExpressionParts {
  assert(node.type === MULDIV_OP, "Invalid Node Type");
  const operator = node.token?.text;
  assert(operator, "Empty token operator");
  const [left, right] = compileInfixOp(node, opts);
  return withNode(node, {
    // TODO: remove this cast
    operator: operator as Lib.ExpressionOperator,
    options: {},
    args: [...left, ...right],
  });
}

function compileSubtractionOp(node: Node, opts: Options): Lib.ExpressionParts {
  assert(node.type === SUB, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  const [left, right] = compileInfixOp(node, opts);
  return withNode(node, {
    operator: "-",
    options: {},
    args: [...left, ...right],
  });
}

function compileBoolean(node: Node, _opts: Options): boolean {
  assert(node.type === BOOLEAN, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  const text = node.token.text.toLowerCase();
  return text === "true" ? true : false;
}

function compileUnaryOp(node: Node, opts: Options) {
  if (node.children.length > 1) {
    throw new CompileError(t`Unexpected expression`, {
      node: node.children[1],
      token: node.children[1].token,
    });
  } else if (node.children.length === 0) {
    throw new CompileError(t`Expected expression`, { node, token: node.token });
  }
  return compileNode(node.children[0], opts);
}

function compileInfixOp(
  node: Node,
  opts: Options,
): [
  (Lib.ExpressionParts | Lib.ExpressionArg)[],
  (Lib.ExpressionParts | Lib.ExpressionArg)[],
] {
  if (node.children.length > 2) {
    throw new CompileError(t`Unexpected expression`, {
      node: node.children[2],
      token: node.children[2].token,
    });
  } else if (node.children.length === 0) {
    throw new CompileError(t`Expected expression`, { node, token: node.token });
  }

  assert(node.token?.text, "Empty token text");
  const operator = opts.getMBQLName(node.token?.text);

  const leftNode = compileNode(node.children[0], opts);
  const left =
    Lib.isExpressionParts(leftNode) && leftNode.operator === operator
      ? leftNode.args
      : [leftNode];

  const rightNode = compileNode(node.children[1], opts);
  const right = [rightNode];

  return [left, right];
}

function withNode<T>(node: Node, expressionParts: T): T {
  if (typeof expressionParts === "object") {
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
