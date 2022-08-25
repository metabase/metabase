import { ngettext, msgid, t } from "ttag";

import { OPERATOR as OP } from "metabase/lib/expressions/tokenizer";
import { ResolverError } from "metabase/lib/expressions/pratt/types";
import { getMBQLName, MBQL_CLAUSES } from "metabase/lib/expressions";

export const FIELD_MARKERS = ["dimension", "segment", "metric"];
export const LOGICAL_OPS = [OP.Not, OP.And, OP.Or];
export const NUMBER_OPS = [OP.Plus, OP.Minus, OP.Star, OP.Slash];
export const COMPARISON_OPS = [
  OP.Equal,
  OP.NotEqual,
  OP.GreaterThan,
  OP.LessThan,
  OP.GreaterThanEqual,
  OP.LessThanEqual,
];

const MAP_TYPE = {
  boolean: "segment",
  aggregation: "metric",
};

const EQUIVALENT_FILTERS = {
  "does-not-contain": "contains",
  "not-null": "is-null",
  "not-empty": "is-empty",
};

function findMBQL(op) {
  let clause = MBQL_CLAUSES[op];
  if (!clause) {
    const alt = EQUIVALENT_FILTERS[op];
    if (alt) {
      clause = MBQL_CLAUSES[alt];
    }
  }
  return clause;
}

const isCompatible = (a, b) => {
  if (a === b) {
    return true;
  }
  if (a === "expression" && (b === "number" || b === "string")) {
    return true;
  }
  if (a === "aggregation" && b === "number") {
    return true;
  }
  if (a === "number" && b === "aggregation") {
    return true;
  }
  return false;
};

export function resolve(expression, type = "expression", fn = undefined) {
  if (Array.isArray(expression)) {
    const [op, ...operands] = expression;

    if (FIELD_MARKERS.includes(op)) {
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
    if (LOGICAL_OPS.includes(op)) {
      operandType = "boolean";
    } else if (NUMBER_OPS.includes(op)) {
      operandType = type === "aggregation" ? type : "number";
    } else if (op === "true" || op === "false") {
      operandType = "expression";
    } else if (COMPARISON_OPS.includes(op)) {
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
    } else if (op === "case") {
      const [pairs, options] = operands;
      if (pairs.length < 1) {
        throw new ResolverError(
          t`CASE expects 2 arguments or more`,
          expression.node,
        );
      }

      const resolvedPairs = pairs.map(([tst, val]) => [
        resolve(tst, "boolean", fn),
        resolve(val, type, fn),
      ]);

      if (options && "default" in options) {
        const resolvedOptions = {
          default: resolve(options.default, type, fn),
        };
        return [op, resolvedPairs, resolvedOptions];
      }

      return [op, resolvedPairs];
    }

    if (operandType) {
      return [
        op,
        ...operands.map(operand => resolve(operand, operandType, fn)),
      ];
    }

    const clause = findMBQL(op);
    if (!clause) {
      throw new ResolverError(t`Unknown function ${op}`, expression.node);
    }
    const { displayName, args, multiple, hasOptions } = clause;
    if (!isCompatible(type, clause.type)) {
      throw new ResolverError(
        t`Expecting ${type} but found function ${displayName} returning ${clause.type}`,
        expression.node,
      );
    }
    if (!multiple) {
      const expectedArgsLength = args.length;
      const maxArgCount = hasOptions
        ? expectedArgsLength + 1
        : expectedArgsLength;
      if (
        operands.length < expectedArgsLength ||
        operands.length > maxArgCount
      ) {
        throw new ResolverError(
          ngettext(
            msgid`Function ${displayName} expects ${expectedArgsLength} argument`,
            `Function ${displayName} expects ${expectedArgsLength} arguments`,
            expectedArgsLength,
          ),
          expression.node,
        );
      }
    }
    const resolvedOperands = operands.map((operand, i) => {
      if (i >= args.length) {
        // as-is, optional object for e.g. ends-with, time-interval, etc
        return operand;
      }
      return resolve(operand, args[i], fn);
    });
    return [op, ...resolvedOperands];
  } else if (
    !isCompatible(
      type,
      typeof expression === "boolean" ? "expression" : typeof expression,
    )
  ) {
    throw new Error(
      t`Expecting ${type} but found ${JSON.stringify(expression)}`,
    );
  }
  return expression;
}
