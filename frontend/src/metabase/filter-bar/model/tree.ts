import { type FilterTree, isLeafTree } from "../types";

export type BoolOp = Exclude<FilterTree<unknown>["type"], "leaf">;

export const PRECEDENCE: Record<BoolOp, number> = { or: 1, and: 2 };

export const emptyTree = <F>(): FilterTree<F> => ({
  type: "and",
  children: [],
});

export const isEmptyTree = <F>(tree: FilterTree<F>): boolean =>
  !isLeafTree(tree) && tree.children.every(isEmptyTree);
