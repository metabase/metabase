import { type FilterTree, type PillContent, isLeafTree } from "../types";

import { type NodeType, type Token, isThenToken } from "./types";

export const pillToken = <F>(filter: F, content: PillContent): Token<F> => ({
  type: "pill",
  filter,
  content,
});

export const connectorToken = <F>(type: NodeType): Token<F> => ({ type });

export const openToken = <F>(): Token<F> => ({ type: "open" });

export const closeToken = <F>(): Token<F> => ({ type: "close" });

export const thenToken = <F>(stage: number): Token<F> => ({
  type: "then",
  stage,
});

export const PRECEDENCE: Record<NodeType, number> = { or: 1, and: 2 };

export const emptyTree = <F>(): FilterTree<F> => ({
  type: "and",
  children: [],
});

export const isEmptyTree = <F>(tree: FilterTree<F>): boolean =>
  !isLeafTree(tree) && tree.children.every(isEmptyTree);

export const dropTrailingEmpty = <T>(
  items: readonly T[],
  isEmpty: (item: T) => boolean,
): T[] => items.slice(0, items.findLastIndex((item) => !isEmpty(item)) + 1);

export type StageSegment<F> = {
  stage: number;
  tokens: Token<F>[];
  offset: number;
};

export const splitByThen = <F>(
  tokens: readonly Token<F>[],
): StageSegment<F>[] =>
  tokens.reduce<StageSegment<F>[]>(
    (segments, token, index) => {
      if (isThenToken(token)) {
        return [
          ...segments,
          { stage: token.stage, tokens: [], offset: index + 1 },
        ];
      }
      const last = segments.at(-1);
      if (!last) {
        return segments;
      }
      return [
        ...segments.slice(0, -1),
        { ...last, tokens: [...last.tokens, token] },
      ];
    },
    [{ stage: 0, tokens: [], offset: 0 }],
  );

export const joinTokens = <F>(
  parts: readonly (readonly Token<F>[])[],
  separator: Token<F>,
): Token<F>[] =>
  parts.flatMap((part, index) =>
    index === 0 ? [...part] : [separator, ...part],
  );

export const getStageIndex = <F>(
  tokens: readonly Token<F>[],
  index: number,
): number => {
  const tokensBefore = tokens.slice(0, index);
  const lastThenBefore = tokensBefore.findLast(isThenToken);
  return lastThenBefore?.stage ?? 0;
};
