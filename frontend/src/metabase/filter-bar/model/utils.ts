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

const dropTrailingEmptyStages = <F>(stages: TokenStages<F>) =>
  stages.slice(0, stages.findLastIndex((tokens) => tokens.length > 0) + 1);

export const isSameStages = <F>(
  stages: TokenStages<F>,
  other: TokenStages<F>,
) => {
  const left = dropTrailingEmptyStages(stages);
  const right = dropTrailingEmptyStages(other);
  return (
    left.length === right.length &&
    left.every(
      (tokens, stage) =>
        tokens.length === right[stage].length &&
        tokens.every((token, index) => isSameToken(token, right[stage][index])),
    )
  );
};

export const hasOr = <F>(tokens: readonly Token<F>[]) => tokens.some(isOrToken);

export const CONNECTOR_TEXT: Record<ConnectorToken["type"], string> = {
  and: "and",
  or: "or",
};

export const PAREN_TEXT: Record<ParenToken["type"], string> = {
  open: "(",
  close: ")",
};
