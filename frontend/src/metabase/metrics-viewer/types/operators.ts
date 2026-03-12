export type MathOperator = "+" | "-" | "*" | "/";
export const MATH_OPERATORS: MathOperator[] = ["+", "-", "*", "/"];

export function isMathOperator(key: string): key is MathOperator {
  return key === "+" || key === "-" || key === "*" || key === "/";
}

export type ExpressionToken =
  | { type: "metric"; metricIndex: number }
  | { type: "constant"; value: number }
  | { type: "operator"; op: MathOperator }
  | { type: "open-paren" }
  | { type: "close-paren" }
  | { type: "separator" };
