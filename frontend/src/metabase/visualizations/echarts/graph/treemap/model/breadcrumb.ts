import type { TreemapTree } from "./types";

export interface TreemapBreadcrumbModel {
  groupLabel: string | null;
  value: number;
}

function getGrandTotal(tree: TreemapTree): number {
  return tree.reduce((sum, node) => sum + node.value, 0);
}

export function getTreemapBreadcrumbModel(
  tree: TreemapTree,
  viewRootId: string | null,
): TreemapBreadcrumbModel {
  // Top level overview
  if (viewRootId == null) {
    return { groupLabel: null, value: getGrandTotal(tree) };
  }

  const group = tree[Number(viewRootId)];
  if (group) {
    return { groupLabel: group.displayName, value: group.value };
  }

  return { groupLabel: null, value: getGrandTotal(tree) };
}
