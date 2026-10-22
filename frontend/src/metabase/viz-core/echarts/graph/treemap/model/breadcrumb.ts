import { isOverview } from "./tree";
import type { TreemapTree } from "./types";
import { getTreemapTotal } from "./value";

export interface TreemapBreadcrumbModel {
  groupLabel: string | null;
  value: number;
}

export function getTreemapBreadcrumbModel(
  tree: TreemapTree,
  viewRootId: string | null,
): TreemapBreadcrumbModel {
  if (isOverview(viewRootId)) {
    return { groupLabel: null, value: getTreemapTotal(tree) };
  }

  const group = tree[Number(viewRootId)];
  if (group) {
    return { groupLabel: group.displayName, value: group.value };
  }

  return { groupLabel: null, value: getTreemapTotal(tree) };
}
