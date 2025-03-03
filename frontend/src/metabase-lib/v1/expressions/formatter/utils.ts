import type { AstPath } from "prettier";

import * as nodeMatchers from "../matchers";

type Assertion<T> = T extends (expr: unknown) => expr is infer U ? U : never;
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
export const pathMatchers = lift(nodeMatchers);
