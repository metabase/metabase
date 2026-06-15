import type { TreemapTree } from "./types";

export function getTreemapTotal(tree: TreemapTree) {
  return tree.reduce((sum, node) => sum + node.value, 0);
}
