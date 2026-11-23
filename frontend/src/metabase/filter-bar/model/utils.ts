import type { FilterTree } from "../types";

import type { NodeType, Token } from "./types";

export const PRECEDENCE: Record<NodeType, number> = { or: 1, and: 2 };

export const emptyTree = <F>(): FilterTree<F> => ({
  type: "and",
  children: [],
});

export const isEmptyTree = <F>(tree: FilterTree<F>): boolean =>
  tree.type !== "leaf" && tree.children.every(isEmptyTree);

export const dropTrailingEmpty = <T>(
  items: readonly T[],
  isEmpty: (item: T) => boolean,
): T[] => items.slice(0, items.findLastIndex((item) => !isEmpty(item)) + 1);

export const splitByThen = <F>(tokens: readonly Token<F>[]): Token<F>[][] =>
  tokens.reduce<Token<F>[][]>(
    (segments, token) => {
      if (token.type === "then") {
        return [...segments, []];
      }
      const last = segments.at(-1) ?? [];
      return [...segments.slice(0, -1), [...last, token]];
    },
    [[]],
  );

export const joinTokens = <F>(
  parts: readonly (readonly Token<F>[])[],
  separator: Token<F>,
): Token<F>[] =>
  parts.flatMap((part, index) =>
    index === 0 ? [...part] : [separator, ...part],
  );
