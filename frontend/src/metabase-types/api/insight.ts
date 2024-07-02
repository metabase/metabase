import type { DateTimeAbsoluteUnit } from "./query";

export type InsightExpressionOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "log"
  | "pow"
  | "exp";

export type InsightExpressionOperand = "x" | number | InsightExpression;

export type InsightExpression =
  | [
      InsightExpressionOperator,
      InsightExpressionOperand,
      InsightExpressionOperand,
    ]
  | [InsightExpressionOperator, InsightExpressionOperand];

export interface Insight {
  col: string;
  unit: DateTimeAbsoluteUnit;

  // Used for trend line on line/area/bar/combo charts.
  // Will try to use "best-fit" expression if it exsits,
  // if not the function will be x*slope + offset
  "best-fit"?: InsightExpression;
  offset: number;
  slope: number;

  // Used for smart scalar
  "last-change": number;
  "last-value": number;
  "previous-value": number;
}
