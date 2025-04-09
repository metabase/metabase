import { t } from "ttag";

import { type NumberValue, parseNumber } from "metabase/lib/number";
import * as Lib from "metabase-lib";

import {
  getMBQLName as defaultGetMBQLName,
  getClauseDefinition,
} from "../config";
import { CompileError } from "../errors";
import {
  isBigIntLiteral,
  isBooleanLiteral,
  isFloatLiteral,
  isIntegerLiteral,
  isStringLiteral,
} from "../matchers";
import { unescapeString } from "../string";

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
) {
  return compileRoot(node, { getMBQLName });
}

function compileNode(
  node: Node,
  opts: Options,
): Lib.ExpressionParts | Lib.ExpressionArg {
  const fn = COMPILE.get(node.type);
  if (!fn) {
    throw new CompileError(t`Invalid node type`, node);
  }
  return fn(node, opts);
}

function compileRoot(
  node: Node,
  opts: Options,
):
  | Lib.ExpressionParts
  | Lib.SegmentMetadata
  | Lib.MetricMetadata
  | Lib.ColumnMetadata {
  assert(node.type === ROOT, t`Must be root node`);
  assert(node.children.length === 1, t`Root must have one child`);

  const result = compileNode(node.children[0], opts);
  if (isStringLiteral(result)) {
    return {
      operator: "value",
      options: { "base-type": "type/Text" },
      args: [result],
    };
  } else if (isBooleanLiteral(result)) {
    return {
      operator: "value",
      options: { "base-type": "type/Boolean" },
      args: [result],
    };
  } else if (isIntegerLiteral(result)) {
    return {
      operator: "value",
      options: { "base-type": "type/Integer" },
      args: [result],
    };
  } else if (isFloatLiteral(result)) {
    return {
      operator: "value",
      options: { "base-type": "type/Float" },
      args: [result],
    };
  } else if (isBigIntLiteral(result)) {
    return {
      operator: "value",
      options: { "base-type": "type/BigInteger" },
      args: [result],
    };
  }

  return result;
}

function compileField(node: Node): Lib.ExpressionParts {
  assert(node.type === FIELD, "Invalid node type");
  assert(node.token?.text, "Empty field name");
  assert(node.token?.value, "Empty field value");

  return withNode(node, {
    operator: "dimension" as Lib.ExpressionOperator,
    options: {},
    args: [node.token.value],
  });
}

function compileIdentifier(node: Node): Lib.ExpressionParts {
  assert(node.type === IDENTIFIER, t`Invalid node type`);
  assert(node.token?.text, t`Empty token text`);

  const name = node.token.text;
  return withNode(node, {
    operator: "dimension" as Lib.ExpressionOperator,
    options: {},
    args: [name],
  });
}

function compileGroup(
  node: Node,
  opts: Options,
): Lib.ExpressionParts | Lib.ExpressionArg {
  assert(node.type === GROUP, t`Invalid node type`);
  assert(node.children.length === 1, t`Group must have one child`);

  return compileNode(node.children[0], opts);
}

function compileString(node: Node): string {
  assert(node.type === STRING, t`Invalid node type`);
  assert(typeof node.token?.value === "string", t`No token text`);

  return node.token.value;
}

function compileLogicalNot(
  node: Node,
  opts: Options,
): Lib.ExpressionParts | Lib.ExpressionArg {
  assert(node.type === LOGICAL_NOT, t`Invalid node type`);

  return compileUnaryOp("not", node, opts);
}

function compileLogicalAnd(node: Node, opts: Options): Lib.ExpressionParts {
  assert(node.type === LOGICAL_AND, t`Invalid node type`);

  return compileInfixOp("and", node, opts);
}

function compileLogicalOr(node: Node, opts: Options): Lib.ExpressionParts {
  assert(node.type === LOGICAL_OR, t`Invalid node type`);

  return compileInfixOp("or", node, opts);
}

function compileComparisonOp(node: Node, opts: Options): Lib.ExpressionParts {
  assert(node.type === COMPARISON, t`Invalid node type`);
  assert(node.token?.text, t`Empty token text`);
  assert(isOperator(node.token.text, opts), t`Invalid operator`);

  return compileInfixOp(node.token.text, node, opts);
}

function compileEqualityOp(node: Node, opts: Options): Lib.ExpressionParts {
  assert(node.type === EQUALITY, t`Invalid node type`);
  assert(node.token?.text, t`Empty token text`);
  assert(isOperator(node.token.text, opts), t`Invalid operator`);

  return compileInfixOp(node.token.text, node, opts);
}

function compileFunctionCall(node: Node, opts: Options): Lib.ExpressionParts {
  assert(node.type === CALL, t`Invalid node type`);
  assert(node.token?.text, t`Empty token text`);
  assert(
    node.children[0].type === ARG_LIST,
    t`First argument must be an arglist`,
  );

  const text = node.token?.text.trim().toLowerCase();
  const operator = opts.getMBQLName(text) ?? text;
  const args = compileArgList(node.children[0], opts);
  const options: Lib.ExpressionOptions = {};

  assert(isOperator(operator, opts), t`Invalid operator`);

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
  }

  return withNode(node, { operator, options, args });
}

function compileArgList(
  node: Node,
  opts: Options,
): (Lib.ExpressionParts | Lib.ExpressionArg)[] {
  assert(node.type === ARG_LIST, t`Invalid node type`);

  return node.children.map((child) => {
    const expr = compileNode(child, opts);
    return withNode(child, expr);
  });
}

function compileNumber(node: Node): NumberValue | Lib.ExpressionParts {
  assert(node.type === NUMBER, t`Invalid node type`);
  assert(node.token?.text, t`No token text`);

  const number = parseNumber(node.token.text);
  if (number == null) {
    throw new CompileError(t`Invalid number format`, node);
  }

  if (typeof number === "bigint") {
    return withNode(node, {
      operator: "value" as Lib.ExpressionOperator,
      options: {
        "base-type": "type/BigInteger",
      },
      args: [String(number)],
    });
  }

  return number;
}

function compileNegative(
  node: Node,
  opts: Options,
): Lib.ExpressionParts | NumberValue {
  assert(node.type === NEGATIVE, t`Invalid node type`);

  const result = compileUnaryOp("-", node, opts);
  if (typeof result.args[0] === "number") {
    return -result.args[0];
  }
  return result;
}

function compileAdditionOp(node: Node, opts: Options): Lib.ExpressionParts {
  assert(node.type === ADD, t`Invalid node type`);

  return compileInfixOp("+", node, opts);
}

function compileMulDivOp(node: Node, opts: Options): Lib.ExpressionParts {
  assert(node.type === MULDIV_OP, t`Invalid node type`);
  assert(node.token?.text, t`Empty token text`);
  assert(isOperator(node.token.text, opts), t`Invalid operator`);

  return compileInfixOp(node.token.text, node, opts);
}

function compileSubtractionOp(node: Node, opts: Options): Lib.ExpressionParts {
  assert(node.type === SUB, t`Invalid node type`);

  return compileInfixOp("-", node, opts);
}

function compileBoolean(node: Node, _opts: Options): boolean {
  assert(node.type === BOOLEAN, t`Invalid node type`);
  assert(node.token?.text, t`Empty token text`);

  const text = node.token.text.toLowerCase();
  return text === "true" ? true : false;
}

function compileUnaryOp(
  operator: Lib.ExpressionOperator,
  node: Node,
  opts: Options,
): Lib.ExpressionParts {
  if (node.children.length > 1) {
    throw new CompileError(t`Unexpected expression`, node.children[1]);
  }
  if (node.children.length === 0) {
    throw new CompileError(t`Expected expression`, node);
  }

  return withNode(node, {
    operator,
    options: {},
    args: [compileNode(node.children[0], opts)],
  });
}

function compileInfixOp(
  operator: Lib.ExpressionOperator,
  node: Node,
  opts: Options,
): Lib.ExpressionParts {
  if (node.children.length > 2) {
    throw new CompileError(t`Unexpected expression`, node.children[2]);
  }
  if (node.children.length === 0) {
    throw new CompileError(t`Expected expression`, node);
  }

  const leftNode = compileNode(node.children[0], opts);
  const left =
    Lib.isExpressionParts(leftNode) && leftNode.operator === operator
      ? leftNode.args
      : [leftNode];

  const rightNode = compileNode(node.children[1], opts);
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

function isOperator(op: string, opts: Options): op is Lib.ExpressionOperator {
  const res = opts.getMBQLName(op);
  return res != null;
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
