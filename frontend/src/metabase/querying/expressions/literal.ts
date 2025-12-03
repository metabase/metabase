import type {
  BooleanLiteral,
  NumericLiteral,
  StringLiteral,
} from "metabase-types/api";

export function isLiteral(
  x: unknown,
): x is StringLiteral | NumericLiteral | BooleanLiteral {
  return isStringLiteral(x) || isNumberLiteral(x) || isBooleanLiteral(x);
}

export function isStringLiteral(x: unknown): x is StringLiteral {
  return typeof x === "string";
}

export function isBooleanLiteral(x: unknown): x is BooleanLiteral {
  return typeof x === "boolean";
}

export function isNumberLiteral(x: unknown): x is NumericLiteral {
  return isIntegerLiteral(x) || isFloatLiteral(x) || isBigIntLiteral(x);
}

export function isIntegerLiteral(x: unknown): x is NumericLiteral {
  return typeof x === "number" && Number.isInteger(x);
}

export function isFloatLiteral(x: unknown): x is NumericLiteral {
  return typeof x === "number" && !Number.isInteger(x);
}

export function isBigIntLiteral(x: unknown): x is NumericLiteral {
  return typeof x === "bigint";
}
