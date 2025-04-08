import type { CallExpression, Expression } from "metabase-types/api";

import { MBQL_CLAUSES } from "./config";
import {
  isBooleanLiteral,
  isCaseOrIf,
  isCaseOrIfOperator,
  isFloatLiteral,
  isIntegerLiteral,
  isOptionsObject,
  isStringLiteral,
} from "./matchers";

export type CompilerPass = (expr: Expression) => Expression;

function isCallExpression(expr: unknown): expr is CallExpression {
  return Array.isArray(expr) && expr.length > 1;
}

export function applyPasses(
  expression: Expression,
  passes: (CompilerPass | false | null)[] = DEFAULT_PASSES,
): Expression {
  let res = expression;
  for (const pass of passes) {
    if (pass) {
      res = pass(res);
    }
  }
  return res;
}

/**
 * Groups case/if assertion/result pairs and adds a default result.
 *
 * ["case", X, Y, Z] becomes ["case", [[X, Y]], { default: Z }]
 */
export const adjustCaseOrIf: CompilerPass = (tree) =>
  modify(tree, (node) => {
    if (isCallExpression(node) && isCaseOrIfOperator(node[0])) {
      const [operator, ...operands] = node;
      const pairs: [Expression, Expression][] = [];
      const pairCount = operands.length >> 1;
      for (let i = 0; i < pairCount; ++i) {
        const tst = operands[i * 2];
        const val = operands[i * 2 + 1];
        if (isOptionsObject(tst) || isOptionsObject(val)) {
          throw new Error("Unsupported case/if options");
        }
        pairs.push([tst, val]);
      }
      if (operands.length > 2 * pairCount) {
        const lastOperand = operands[operands.length - 1];
        const options = isOptionsObject(lastOperand)
          ? lastOperand
          : { default: lastOperand };
        return withAST([operator, pairs, options], node);
      }
      return withAST([operator, pairs], node);
    }
    return node;
  });

/**
 * Adds options to offset.
 *
 * ["offset", X, Y] becomes ["offset", {}, X, Y]
 */
export const adjustOffset: CompilerPass = (tree) =>
  modify(tree, (node) => {
    if (Array.isArray(node)) {
      const [operator] = node;
      if (operator === "offset") {
        if (node.length === 3) {
          const [, expr, n] = node;
          const opts = {};
          return withAST([operator, opts, expr, n], node);
        }
        if (node.length === 4) {
          const [, opts, expr, n] = node;
          return withAST([operator, opts, expr, n], node);
        }
      }
    }
    return node;
  });

/**
 * Replaces "case-insensitive" and "include-current" options with an options object.
 *
 * ["contains", X, Y, "case-insensitive"] becomes ["contains", X, Y, {"case-sensitive": false}]
 * ["contains", X, Y] becomes ["contains", X, Y]
 */
export const adjustOptions: CompilerPass = (tree) =>
  modify(tree, (node) => {
    if (isCallExpression(node)) {
      const [operator, ...operands] = node;
      if (operands.length > 0) {
        const clause = MBQL_CLAUSES[operator];
        if (clause && clause.hasOptions) {
          const index = operands.length - 1;
          const last = operands[index];
          if (last === "case-insensitive") {
            operands[index] = { "case-sensitive": false };
          } else if (last === "include-current") {
            operands[index] = { "include-current": true };
          }
          return withAST([operator, ...operands], node);
          //   if (operands.length > clause.args.length) {
          //     // the last one holds the function options
          //     const index = operands.length - 1;
          //     const options = operands[index];
          //
          //     // HACK: very specific to some string/time functions for now
          //     if (options === "case-insensitive") {
          //       operands[index] = { "case-sensitive": false };
          //     } else if (options === "include-current") {
          //       operands[index] = { "include-current": true };
          //     }
          //
          //     return withAST([operator, ...operands], node);
          //   }
        }
      }
    }
    return node;
  });

/**
 * MBQL clause for an operator that supports multiple arguments *requires* an
 * option object after the operator when there are more than 2 arguments. Compare:
 *
 * ["contains", ["field", 1, null], "A"]
 * ["contains", ["field", 1, null], "A", {"case-sensitive": false}]
 * ["contains", {}, ["field", 1, null], "A", "B"]
 * ["contains", {"case-sensitive": false}, ["field", 1, null], "A", "B"]
 *
 * By default, the expression parser adds the options object as the last operand,
 * so we need to adjust its position here or insert an empty options object if
 * there is none.
 */
export const adjustMultiArgOptions: CompilerPass = (tree) =>
  modify(tree, (node) => {
    if (isCallExpression(node)) {
      const [operator, ...args] = node;
      const clause = MBQL_CLAUSES[operator];

      if (isOptionsObject(args.at(0))) {
        return node;
      }

      if (clause != null && clause.multiple && clause.hasOptions) {
        const lastArg = args.at(-1);
        if (isOptionsObject(lastArg) && args.length > 3) {
          return withAST([operator, lastArg, ...args.slice(0, -1)], node);
        }
        if (!isOptionsObject(lastArg) && args.length > 2) {
          return withAST([operator, {}, ...args], node);
        }
      }
    }
    return node;
  });

/**
 * Replaces boolean fields X with [=, X, true] in places where a boolean is expected.
 *
 * Assumes adjustCaseOrIf has already been run
 */
export const adjustBooleans: CompilerPass = (tree) =>
  modify(tree, (node) => {
    if (isCaseOrIf(node)) {
      const [operator, pairs, options] = node;
      return [
        operator,
        pairs.map(([input, output]): [Expression, Expression] => {
          if (isBooleanField(input)) {
            const replaced: Expression = withAST(["=", input, true], input);
            return [replaced, output];
          }
          return [input, output];
        }),
        options ?? {},
      ];
    } else if (isCallExpression(node)) {
      const [operator, ...operands] = node;
      const { args = [] } = MBQL_CLAUSES[operator] || {};
      return [
        operator,
        ...operands.map((operand, index) => {
          if (isOptionsObject(operand)) {
            return operand;
          }
          if (!isBooleanField(operand) || args[index] !== "boolean") {
            return operand;
          }
          return withAST(["=", operand, true], operand);
        }),
      ];
    }
    return node;
  });

function isBooleanField(input: unknown) {
  if (Array.isArray(input) && input[0] === "field") {
    const [, _id, opts] = input;
    return (
      opts &&
      typeof opts === "object" &&
      "base-type" in opts &&
      opts?.["base-type"] === "type/Boolean"
    );
  }
  return false;
}

export const adjustBigIntLiteral: CompilerPass = (tree) =>
  modify(tree, (node) => {
    if (typeof node === "bigint") {
      return withAST(
        ["value", String(node), { base_type: "type/BigInteger" }],
        node,
      );
    } else {
      return node;
    }
  });

export const adjustTopLevelLiteral: CompilerPass = (tree) => {
  if (isStringLiteral(tree)) {
    return ["value", tree, { base_type: "type/Text" }];
  } else if (isBooleanLiteral(tree)) {
    return ["value", tree, { base_type: "type/Boolean" }];
  } else if (isIntegerLiteral(tree)) {
    return ["value", tree, { base_type: "type/Integer" }];
  } else if (isFloatLiteral(tree)) {
    return ["value", tree, { base_type: "type/Float" }];
  } else {
    return tree;
  }
};

type Transform = (node: Expression) => Expression;

function modify(node: Expression, transform: Transform): Expression {
  // MBQL clause?
  if (Array.isArray(node) && node.length > 0 && typeof node[0] === "string") {
    const [operator, ...operands] = node;
    return withAST(
      transform([
        operator,
        ...operands.map((sub) => modify(sub as Expression, transform)),
      ]),
      node,
    );
  }
  return withAST(transform(node), node);
}

function withAST(
  result: Expression & { node?: Node },
  expr: Expression & { node?: Node },
) {
  // If this expression comes from the compiler, an object property
  // containing the parent AST node will be included for errors
  if (expr?.node && typeof result.node === "undefined") {
    Object.defineProperty(result, "node", {
      writable: false,
      enumerable: false,
      value: expr.node,
    });
  }
  return result;
}

const DEFAULT_PASSES = [
  adjustOptions,
  adjustOffset,
  adjustMultiArgOptions,
  adjustBigIntLiteral,
  adjustTopLevelLiteral,
  adjustCaseOrIf,
  adjustBooleans,
];
