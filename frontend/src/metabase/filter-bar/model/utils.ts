import _ from "underscore";

import { type FilterTree, type PillContent, isLeafTree } from "../types";

import {
  type CloseToken,
  type ConnectorToken,
  type NodeType,
  type OpenToken,
  type ParenToken,
  type PillToken,
  type Token,
  type TokenStages,
  isOrToken,
  isPillToken,
} from "./types";

export const pillToken = <F>(
  filter: F,
  content: PillContent,
): PillToken<F> => ({
  type: "pill",
  filter,
  content,
});

export const connectorToken = (type: NodeType): ConnectorToken => ({ type });

export const openToken = (): OpenToken => ({ type: "open" });

export const closeToken = (): CloseToken => ({ type: "close" });

export const PRECEDENCE: Record<NodeType, number> = { or: 1, and: 2 };

export const emptyTree = <F>(): FilterTree<F> => ({
  type: "and",
  children: [],
});

export const isEmptyTree = <F>(tree: FilterTree<F>): boolean =>
  !isLeafTree(tree) && tree.children.every(isEmptyTree);

// A new separator for each gap: tokens are React keys. `index` is the part after
// the separator.
export const join = <T>(
  parts: readonly (readonly T[])[],
  createSeparator: (index: number) => T,
): T[] =>
  parts.flatMap((part, index) =>
    index === 0 ? [...part] : [createSeparator(index), ...part],
  );

const isSameToken = <F>(token: Token<F>, other: Token<F>) =>
  isPillToken(token)
    ? isPillToken(other) && _.isEqual(token.content, other.content)
    : token.type === other.type;

export const isSameStages = <F>(
  stages: TokenStages<F>,
  other: TokenStages<F>,
) =>
  stages.length === other.length &&
  stages.every(
    (tokens, stage) =>
      tokens.length === other[stage].length &&
      tokens.every((token, index) => isSameToken(token, other[stage][index])),
  );

export const hasOr = <F>(tokens: readonly Token<F>[]) => tokens.some(isOrToken);

export const PAREN_TEXT: Record<ParenToken["type"], string> = {
  open: "(",
  close: ")",
};
