import { OPERATOR as OP } from "./tokenizer";
import { MBQL_CLAUSES } from "./index";

const FIELD_MARKERS = ["dimension", "segment", "metric"];
const LOGICAL_OPS = [OP.Not, OP.And, OP.Or];
const NUMBER_OPS = [OP.Plus, OP.Minus, OP.Star, OP.Slash];
const COMPARISON_OPS = [
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

export function resolve(expression, type, fn) {
  if (Array.isArray(expression)) {
    const [op, ...operands] = expression;

    if (FIELD_MARKERS.includes(op)) {
      const kind = MAP_TYPE[type] || "dimension";
      const [name] = operands;
      return fn ? fn(kind, name) : [kind, name];
    }

    let operandType = null;
    if (LOGICAL_OPS.includes(op)) {
      operandType = "boolean";
    } else if (NUMBER_OPS.includes(op) || op === "coalesce") {
      operandType = type;
    } else if (COMPARISON_OPS.includes(op)) {
      operandType = "expression";
    } else if (op === "concat") {
      operandType = "string";
    } else if (op === "case") {
      const [pairs, options] = operands;

      const resolvedPairs = pairs.map(([tst, val]) => [
        resolve(tst, "boolean", fn),
        resolve(val, type, fn),
      ]);

      if (options && options.default) {
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
    if (clause) {
      const { args } = clause;
      return [
        op,
        ...operands.map((operand, i) => resolve(operand, args[i], fn)),
      ];
    }
  }
  return expression;
}
