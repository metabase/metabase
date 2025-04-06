import { t } from "ttag";

import {
  COMPARISON_OPERATORS,
  LOGICAL_OPERATORS,
  MBQL_CLAUSES,
  NUMBER_OPERATORS,
  getMBQLName,
} from "./config";
import { ResolverError } from "./errors";
import { isCaseOrIfOperator, isOptionsObject } from "./matchers";

const FIELD_MARKERS = ["dimension", "segment", "metric"];

const MAP_TYPE = {
  boolean: "segment",
  aggregation: "metric",
};

/**
 * @param {{
 *   expression: import("./pratt").Expr
 *   type?: string
 *   fn?: ?(kind: string, name: string, node: import("./pratt").Node) => void
 * }} options
 */
export function resolve({ expression, type = "expression", fn = undefined }) {
  if (Array.isArray(expression)) {
    const [op, ...operands] = expression;

    if (op === "value") {
      return expression;
    } else if (FIELD_MARKERS.includes(op)) {
      const kind = MAP_TYPE[type] || "dimension";
      const [name] = operands;
      if (fn) {
        try {
          return fn(kind, name, expression.node);
        } catch (err) {
          // A second chance when field is not found:
          // maybe it is a function with zero argument (e.g. Count, CumulativeCount)
          const func = getMBQLName(name.trim().toLowerCase());
          if (func && MBQL_CLAUSES[func].args.length === 0) {
            return [func];
          }
          throw err;
        }
      }
      return [kind, name];
    }

    let operandType = null;
    if (LOGICAL_OPERATORS.has(op)) {
      operandType = "boolean";
    } else if (NUMBER_OPERATORS.has(op)) {
      operandType = type === "aggregation" ? type : "number";
    } else if (op === "true" || op === "false") {
      operandType = "expression";
    } else if (COMPARISON_OPERATORS.has(op)) {
      operandType = "expression";
      const [firstOperand] = operands;
      if (typeof firstOperand === "number" && !Array.isArray(firstOperand)) {
        throw new ResolverError(
          t`Expecting field but found ${firstOperand}`,
          expression.node,
        );
      }
    } else if (op === "concat") {
      operandType = "expression";
    } else if (op === "coalesce") {
      operandType = type;
    } else if (isCaseOrIfOperator(op)) {
      const [pairs, options] = operands;
      if (pairs.length < 1) {
        throw new ResolverError(
          t`${op.toUpperCase()} expects 2 arguments or more`,
          expression.node,
        );
      }

      const resolvedPairs = pairs.map(([tst, val]) => [
        resolve({ expression: tst, type: "boolean", fn }),
        resolve({ expression: val, type, fn }),
      ]);

      if (options && "default" in options) {
        const resolvedOptions = {
          default: resolve({ expression: options.default, type, fn }),
        };
        return [op, resolvedPairs, resolvedOptions];
      }

      return [op, resolvedPairs];
    }

    if (operandType) {
      return [
        op,
        ...operands.map((operand) =>
          resolve({ expression: operand, type: operandType, fn }),
        ),
      ];
    }

    const clause = MBQL_CLAUSES[op];
    if (!clause) {
      throw new ResolverError(t`Unknown function ${op}`, expression.node);
    }

    const { args } = clause;
    const resolvedOperands = operands.map((operand, i) => {
      if ((i >= args.length && !clause.multiple) || isOptionsObject(operand)) {
        // as-is, optional object for e.g. ends-with, time-interval, etc
        return operand;
      }
      return resolve({ expression: operand, type: args[i], fn });
    });
    return [op, ...resolvedOperands];
  }
  return expression;
}
