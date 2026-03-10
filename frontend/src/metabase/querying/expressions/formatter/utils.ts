import type { AstPath } from "prettier";

import * as Lib from "metabase-lib";

import { EXPRESSION_OPERATORS } from "../config";
import * as literal from "../literal";

type Assertion<T> = T extends (expr: any) => expr is infer U ? U : never;
type Lifted<T> = {
  [K in keyof T]: (path: AstPath<unknown>) => path is AstPath<Assertion<T[K]>>;
};

/**
 * Lift all matchers to work on Prettier's AstPath instead of on
 * single Expression nodes.
 */
function lift<T>(matchers: T): Lifted<T> {
  // @ts-expect-error: map is empty
  const res: Lifted<T> = {};

  for (const key in matchers) {
    const matcher = matchers[key];
    // @ts-expect-error: matcher is valid
    res[key] = liftMatcher(matcher);
  }
  return res;
}

/**
 * Lift a single matcher to work on Prettier's AstPath instead of on
 * a single Expression node.
 */
function liftMatcher<T>(
  matcher: (expr: unknown) => expr is T,
): (path: AstPath<unknown>) => path is AstPath<T> {
  return (path: AstPath<unknown>): path is AstPath<T> => matcher(path.node);
}

/**
 * Lift all matchers to work on Prettier's AstPath instead of on
 * single Expression nodes.
 *
 * For example, this will verify that path.node is a string literal and
 * asserts that path is AstPath<string>.
 * @example
 *   pathMatchers.isStringLiteral(path)
 */
export const pathMatchers = lift({
  ...literal,
  isExpressionParts: Lib.isExpressionParts,
  isColumnMetadata: Lib.isColumnMetadata,
  isMetricMetadata: Lib.isMetricMetadata,
  isMeasureMetadata: Lib.isMeasureMetadata,
  isSegmentMetadata: Lib.isSegmentMetadata,
  isExpressionOperator,
  isDimensionOperator,
  isValueOperator,
});

/**
 * Return true if the node is an Lib.ExpressionParts and the operator is
 * one of + - / * < > >= <= = != and or not.
 */
export function isExpressionOperator(
  node: Lib.ExpressionParts | Lib.ExpressionArg,
): node is Lib.ExpressionParts {
  return Lib.isExpressionParts(node) && node.operator in EXPRESSION_OPERATORS;
}

/**
 * Return true if the node is an Lib.ExpressionParts and the operator is
 * value.
 */
export function isValueOperator(node: Lib.ExpressionParts) {
  return Lib.isExpressionParts(node) && node.operator === "value";
}

/**
 * Return true if the node is an Lib.ExpressionParts and the operator is
 * dimension (internal use only).
 */
export function isDimensionOperator(node: Lib.ExpressionParts) {
  return (
    Lib.isExpressionParts(node) && (node.operator as string) === "dimension"
  );
}
