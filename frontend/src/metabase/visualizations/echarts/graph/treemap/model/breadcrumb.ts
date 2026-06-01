import type { TreemapTree } from "./types";

export interface TreemapBreadcrumbModel {
  groupLabel: string;
}

/**
 * Derive the breadcrumb shown over the treemap from the current view root.
 *
 * The treemap is at most two levels deep, so the breadcrumb path is always
 * "All / <group>". At the overview (`viewRootId == null`) there is nothing to
 * navigate back from, so we render no breadcrumb. The constant "All" root label
 * is added by the component (it is user-facing copy); this model only carries
 * the drilled-in group's display name.
 */
export function getTreemapBreadcrumbModel(
  tree: TreemapTree,
  viewRootId: string | null,
): TreemapBreadcrumbModel | null {
  if (viewRootId == null) {
    return null;
  }

  const group = tree[Number(viewRootId)];
  if (group == null) {
    return null;
  }

  return { groupLabel: group.displayName };
}
