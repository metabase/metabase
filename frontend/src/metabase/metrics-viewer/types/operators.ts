export type MathOperator = "+" | "-" | "*" | "/";
export const MATH_OPERATORS: MathOperator[] = ["+", "-", "*", "/"];

export function isMathOperator(key: string): key is MathOperator {
  return key === "+" || key === "-" || key === "*" || key === "/";
}
