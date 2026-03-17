export type MathOperator = "+" | "-" | "*" | "/";
export const MATH_OPERATORS: MathOperator[] = ["+", "-", "*", "/"];

export function isMathOperator(key: string): key is MathOperator {
  return key === "+" || key === "-" || key === "*" || key === "/";
}

/**
 * @deprecated Use `ExpressionSubToken` from `viewer-state.ts` instead.
 * This type remains for backward compatibility with the old token-based
 * expression system and will be removed once the migration is complete.
 */
export type ExpressionToken =
  | { type: "metric"; metricIndex: number }
  | { type: "constant"; value: number }
  | { type: "operator"; op: MathOperator }
  | { type: "open-paren" }
  | { type: "close-paren" }
  | { type: "separator" };
