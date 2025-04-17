import { t } from "ttag";

import { type NumberValue, parseNumber } from "metabase/lib/number";
import * as Lib from "metabase-lib";

import { getClauseDefinition, getMBQLName, isDefinedClause } from "../config";
import {
  isBigIntLiteral,
  isBooleanLiteral,
  isFloatLiteral,
  isIntegerLiteral,
  isStringLiteral,
} from "../matchers";

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
import { type Node, type NodeType, assert, check } from "./types";

type CompileFn = (node: Node) => Lib.ExpressionParts | Lib.ExpressionArg;

export function compile(node: Node) {
  return compileRoot(node);
}

function compileNode(node: Node): Lib.ExpressionParts | Lib.ExpressionArg {
  const fn = COMPILE.get(node.type);
  assert(fn, `Invalid node type: ${node.type}`);
  return fn(node);
}

function compileRoot(
  node: Node,
):
  | Lib.ExpressionParts
  | Lib.SegmentMetadata
  | Lib.MetricMetadata
  | Lib.ColumnMetadata {
  assert(node.type === ROOT, t`Must be root node`);
  assert(node.children.length === 1, t`Root must have one child`);

  const value = compileNode(node.children[0]);
  if (isStringLiteral(value)) {
    return compileValue(value, "type/Text");
  } else if (isBooleanLiteral(value)) {
    return compileValue(value, "type/Boolean");
  } else if (isIntegerLiteral(value)) {
    return compileValue(value, "type/Integer");
  } else if (isFloatLiteral(value)) {
    return compileValue(value, "type/Float");
  } else if (isBigIntLiteral(value)) {
    return compileValue(value, "type/BigInteger");
  }

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

function compileGroup(node: Node): Lib.ExpressionParts | Lib.ExpressionArg {
  assert(node.type === GROUP, t`Invalid node type`);
  assert(node.children.length === 1, t`Group must have one child`);

  return compileNode(node.children[0]);
}

function compileString(node: Node): string {
  assert(node.type === STRING, t`Invalid node type`);
  assert(typeof node.token?.value === "string", t`No token text`);

  return node.token.value;
}

function compileLogicalNot(
  node: Node,
): Lib.ExpressionParts | Lib.ExpressionArg {
  assert(node.type === LOGICAL_NOT, t`Invalid node type`);

  return compileUnaryOp("not", node);
}

function compileLogicalAnd(node: Node): Lib.ExpressionParts {
  assert(node.type === LOGICAL_AND, t`Invalid node type`);

  return compileInfixOp("and", node);
}

function compileLogicalOr(node: Node): Lib.ExpressionParts {
  assert(node.type === LOGICAL_OR, t`Invalid node type`);

  return compileInfixOp("or", node);
}

function compileComparisonOp(node: Node): Lib.ExpressionParts {
  assert(node.type === COMPARISON, t`Invalid node type`);
  assert(node.token?.text, t`Empty token text`);
  assert(isOperator(node.token.text), t`Invalid operator: ${node.token.text}`);

  return compileInfixOp(node.token.text, node);
}

function compileEqualityOp(node: Node): Lib.ExpressionParts {
  assert(node.type === EQUALITY, t`Invalid node type`);
  assert(node.token?.text, t`Empty token text`);
  assert(isOperator(node.token.text), t`Invalid operator: ${node.token.text}`);

  return compileInfixOp(node.token.text, node);
}

function compileFunctionCall(node: Node): Lib.ExpressionParts {
  assert(node.type === CALL, t`Invalid node type`);
  assert(node.token?.text, t`Empty token text`);
  assert(
    node.children[0].type === ARG_LIST,
    t`First argument must be an arglist`,
  );

  const text = node.token?.text.trim().toLowerCase();
  const operator = getMBQLName(text) ?? text;

  check(isDefinedClause(operator), t`Unknown function ${operator}`, node);

  const args = compileArgList(node.children[0]);
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
  }

  return withNode(node, {
    operator,
    options,
    args,
  });
}

function compileArgList(
  node: Node,
): (Lib.ExpressionParts | Lib.ExpressionArg)[] {
  assert(node.type === ARG_LIST, t`Invalid node type`);

  return node.children.map((child) => {
    const expr = compileNode(child);
    return withNode(child, expr);
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

function compileNegative(node: Node): Lib.ExpressionParts | NumberValue {
  assert(node.type === NEGATIVE, t`Invalid node type`);

  const result = compileUnaryOp("-", node);
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

function compileAdditionOp(node: Node): Lib.ExpressionParts {
  assert(node.type === ADD, t`Invalid node type`);

  return compileInfixOp("+", node);
}

function compileMulDivOp(node: Node): Lib.ExpressionParts {
  assert(node.type === MULDIV_OP, t`Invalid node type`);
  assert(node.token?.text, t`Empty token text`);
  assert(isOperator(node.token.text), t`Invalid operator: ${node.token.text}`);

  return compileInfixOp(node.token.text, node);
}

function compileSubtractionOp(node: Node): Lib.ExpressionParts {
  assert(node.type === SUB, t`Invalid node type`);

  return compileInfixOp("-", node);
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
): Lib.ExpressionParts {
  check(node.children.length > 0, t`Expected expression`, node);
  check(node.children.length < 2, t`Unexpected expression`, node.children[1]);

  return withNode(node, {
    operator,
    options: {},
    args: [compileNode(node.children[0])],
  });
}

function compileInfixOp(
  operator: Lib.ExpressionOperator,
  node: Node,
): Lib.ExpressionParts {
  check(node.children.length > 0, t`Expected expression`, node);
  check(node.children.length < 3, t`Unxpected expression`, node.children[2]);

  const leftNode = compileNode(node.children[0]);
  const left =
    Lib.isExpressionParts(leftNode) && leftNode.operator === operator
      ? leftNode.args
      : [leftNode];

  const rightNode = compileNode(node.children[1]);
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

function isOperator(op: string): op is Lib.ExpressionOperator {
  const res = getMBQLName(op);
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
