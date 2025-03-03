import type {
  BooleanLiteral,
  CallExpression,
  CallOptions,
  CaseOrIfExpression,
  CaseOrIfOperator,
  Expression,
  FieldReference,
  MetricAgg,
  NumericLiteral,
  OffsetExpression,
  SegmentFilter,
  StringLiteral,
} from "metabase-types/api";

import { FUNCTIONS, OPERATORS } from "./config";

export function isExpression(expr: unknown): expr is Expression {
  return (
    isLiteral(expr) ||
    isOperator(expr) ||
    isFunction(expr) ||
    isDimension(expr) ||
    isMetric(expr) ||
    isSegment(expr) ||
    isCaseOrIf(expr)
  );
}

export function isEmpty(expr: unknown): expr is [] {
  return expr == null || (Array.isArray(expr) && expr.length === 0);
}

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
  return typeof expr === "number";
}

export function isOperator(expr: unknown): expr is CallExpression {
  return (
    Array.isArray(expr) &&
    OPERATORS.has(expr[0]) &&
    expr.slice(1).every(arg => isExpression(arg) || isOptionsObject(arg))
  );
}

export function isOptionsObject(obj: unknown): obj is CallOptions {
  return obj ? Object.getPrototypeOf(obj) === Object.prototype : false;
}

export function isFunction(expr: unknown): expr is CallExpression {
  return (
    Array.isArray(expr) &&
    FUNCTIONS.has(expr[0]) &&
    expr.slice(1).every(arg => isExpression(arg) || isOptionsObject(arg))
  );
}

export function isDimension(expr: unknown): expr is FieldReference {
  return (
    Array.isArray(expr) && (expr[0] === "field" || expr[0] === "expression")
  );
}

export function isMetric(expr: unknown): expr is MetricAgg {
  return (
    Array.isArray(expr) && expr[0] === "metric" && typeof expr[1] === "number"
  );
}

export function isSegment(expr: unknown): expr is SegmentFilter {
  return (
    Array.isArray(expr) && expr[0] === "segment" && typeof expr[1] === "number"
  );
}

export function isCaseOrIfOperator(
  operator: string,
): operator is CaseOrIfOperator {
  return operator === "case" || operator === "if";
}

export function isCaseOrIf(expr: unknown): expr is CaseOrIfExpression {
  return Array.isArray(expr) && isCaseOrIfOperator(expr[0]); // && _.all(expr.slice(1), isValidArg)
}

export function isOffset(expr: unknown): expr is OffsetExpression {
  return Array.isArray(expr) && expr[0] === "offset";
}
