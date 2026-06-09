import type { TreemapTree } from "./types";

export interface TreemapBreadcrumbModel {
  /**
   * The current view's drilled-in group name, or `null` at the overview (where
   * the bar reads "Total"). The "Total" copy is user-facing and added by the
   * component; this model only carries the drilled-in group's display name.
   */
  groupLabel: string | null;
  /**
   * The current view's total: the grand total at the overview, or the drilled-in
   * group's value. Always rendered at 100% — the bar summarises the total of
   * whatever is currently in view.
   */
  value: number;
}

function getGrandTotal(tree: TreemapTree): number {
  return tree.reduce((sum, node) => sum + node.value, 0);
}

/**
 * Derive the top breadcrumb bar from the current view root. The bar is always
 * shown (overview and drilled, 1-level and 2-level): at the overview it shows
 * the whole dataset ("Total" + grand total), and when drilled into a group it
 * shows that group ("← group" + the group's value). An out-of-range view root
 * falls back to the overview.
 */
export function getTreemapBreadcrumbModel(
  tree: TreemapTree,
  viewRootId: string | null,
): TreemapBreadcrumbModel {
  if (viewRootId == null) {
    return { groupLabel: null, value: getGrandTotal(tree) };
  }

  const group = tree[Number(viewRootId)];
  if (group == null) {
    return { groupLabel: null, value: getGrandTotal(tree) };
  }

  return { groupLabel: group.displayName, value: group.value };
}
