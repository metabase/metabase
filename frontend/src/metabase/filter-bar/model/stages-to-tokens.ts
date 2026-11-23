import type {
  FilterBarAdapter,
  FilterBarStageAdapter,
  FilterStages,
  FilterTree,
} from "../types";

import type { NodeType, Token } from "./types";
import {
  PRECEDENCE,
  dropTrailingEmpty,
  isEmptyTree,
  joinTokens,
} from "./utils";

const treeToTokens = <F>(
  node: FilterTree<F>,
  stageAdapter: FilterBarStageAdapter<F>,
  parentType?: NodeType,
): Token<F>[] => {
  if (node.type === "leaf") {
    return [
      {
        type: "pill",
        filter: node.filter,
        content: stageAdapter.toPill(node.filter),
      },
    ];
  }

  const children = node.children.filter((child) => !isEmptyTree(child));
  if (children.length === 1) {
    return treeToTokens(children[0], stageAdapter, parentType);
  }

  const tokens = joinTokens(
    children.map((child) => treeToTokens(child, stageAdapter, node.type)),
    { type: node.type },
  );
  const needsParens =
    parentType !== undefined && PRECEDENCE[node.type] < PRECEDENCE[parentType];

  return needsParens
    ? [{ type: "open" }, ...tokens, { type: "close" }]
    : tokens;
};

export const stagesToTokens = <F>(
  stages: FilterStages<F>,
  adapter: FilterBarAdapter<F>,
): Token<F>[] => {
  const segments = dropTrailingEmpty(stages, isEmptyTree).map(
    (tree, stageIndex) => treeToTokens(tree, adapter.stage(stageIndex)),
  );

  return joinTokens(segments, { type: "then" });
};
