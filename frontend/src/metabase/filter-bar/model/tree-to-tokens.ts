import {
  type FilterBarAdapter,
  type FilterBarStageAdapter,
  type FilterStages,
  type FilterTree,
  isLeafTree,
} from "../types";

import {
  type Token,
  type TokenStages,
  applyImplicitAnds,
  boolOpToken,
  closeToken,
  openToken,
  pillToken,
} from "./tokens";
import { type BoolOp, PRECEDENCE, isEmptyTree } from "./tree";

export const join = <T>(
  parts: readonly (readonly T[])[],
  createSeparator: () => T,
): T[] =>
  parts.flatMap((part, index) =>
    index === 0 ? [...part] : [createSeparator(), ...part],
  );

const treeToTokens = <F>(
  node: FilterTree<F>,
  stageAdapter: FilterBarStageAdapter<F>,
  parentType?: BoolOp,
): Token<F>[] => {
  if (isLeafTree(node)) {
    return [pillToken(node.filter, stageAdapter.toPill(node.filter))];
  }

  const children = node.children.filter((child) => !isEmptyTree(child));
  if (children.length === 1) {
    return treeToTokens(children[0], stageAdapter, parentType);
  }

  const tokens = join(
    children.map((child) => treeToTokens(child, stageAdapter, node.type)),
    () => boolOpToken(node.type),
  );
  const needsParens =
    parentType !== undefined && PRECEDENCE[node.type] < PRECEDENCE[parentType];

  return needsParens ? [openToken(), ...tokens, closeToken()] : tokens;
};

export const treesToTokens = <F>(
  trees: FilterStages<F>,
  adapter: FilterBarAdapter<F>,
): TokenStages<F> =>
  applyImplicitAnds(
    trees.map((tree, stage) =>
      isEmptyTree(tree) ? [] : treeToTokens(tree, adapter.stage(stage)),
    ),
  );
