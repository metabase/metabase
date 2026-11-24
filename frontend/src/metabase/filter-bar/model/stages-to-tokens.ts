import {
  type FilterBarAdapter,
  type FilterBarStageAdapter,
  type FilterStages,
  type FilterTree,
  isLeafTree,
} from "../types";

import type { NodeType, Token, TokenStages } from "./types";
import {
  PRECEDENCE,
  closeToken,
  connectorToken,
  isEmptyTree,
  join,
  openToken,
  pillToken,
} from "./utils";

const treeToTokens = <F>(
  node: FilterTree<F>,
  stageAdapter: FilterBarStageAdapter<F>,
  parentType?: NodeType,
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
    () => connectorToken(node.type),
  );
  const needsParens =
    parentType !== undefined && PRECEDENCE[node.type] < PRECEDENCE[parentType];

  return needsParens ? [openToken(), ...tokens, closeToken()] : tokens;
};

export const stagesToTokens = <F>(
  stages: FilterStages<F>,
  adapter: FilterBarAdapter<F>,
): TokenStages<F> =>
  stages.map((tree, stage) =>
    isEmptyTree(tree) ? [] : treeToTokens(tree, adapter.stage(stage)),
  );
