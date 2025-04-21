import type {
  BooleanLiteral,
  NumericLiteral,
  StringLiteral,
} from "metabase-types/api";

export function isLiteral(
  expr: unknown,
): expr is StringLiteral | NumericLiteral | BooleanLiteral {
  return (
    isStringLiteral(expr) || isNumberLiteral(expr) || isBooleanLiteral(expr)
  );
}

export function isStringLiteral(expr: unknown): expr is StringLiteral {
  return typeof expr === "string";
}

export function isBooleanLiteral(expr: unknown): expr is BooleanLiteral {
  return typeof expr === "boolean";
}

export function isNumberLiteral(expr: unknown): expr is NumericLiteral {
  return typeof expr === "number" || typeof expr === "bigint";
}

export function isIntegerLiteral(expr: unknown): expr is NumericLiteral {
  return typeof expr === "number" && Number.isInteger(expr);
}

export function isFloatLiteral(expr: unknown): expr is NumericLiteral {
  return typeof expr === "number" && !Number.isInteger(expr);
}

export function isBigIntLiteral(expr: unknown): expr is NumericLiteral {
  return typeof expr === "bigint";
}
