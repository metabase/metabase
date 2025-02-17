import type { AstPath } from "prettier";

import * as nodeMatchers from "../matchers";

type Assertion<T> = T extends (expr: unknown) => expr is infer U ? U : never;
type Lifted<T> = {
  [K in keyof T]: (path: AstPath<unknown>) => path is AstPath<Assertion<T[K]>>;
};

function lift<T>(matchers: T): Lifted<T> {
  // @ts-expect-error: map is empty
  const res: Lifted<T> = {};

  for (const key in matchers) {
    const matcher = matchers[key];
    // @ts-expect-error: matcher is valid
    res[key] = checker(matcher);
  }
  return res;
}

function checker<T>(
  matcher: (expr: unknown) => expr is T,
): (path: AstPath<unknown>) => path is AstPath<T> {
  return (path: AstPath<unknown>): path is AstPath<T> => matcher(path.node);
}

// Lift matchers to work on AstPath instead of the corresponding node.
export const pathMatchers = lift(nodeMatchers);
