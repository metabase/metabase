import type { ITreeNodeItem } from "./types";

export const getInitialExpandedIds = (
  selectedId: ITreeNodeItem["id"],
  nodes: ITreeNodeItem[],
): ITreeNodeItem["id"][] =>
  nodes
    .map((node) => {
      if (node.id === selectedId) {
        return [node.id];
      }

      if (node.children) {
        const path = getInitialExpandedIds(selectedId, node.children);
        return path.length > 0 ? [node.id, ...path] : [];
      }

      return [];
    })
    .flat();

export const getAllExpandableIds = (
  nodes: ITreeNodeItem[],
): ITreeNodeItem["id"][] => {
  const ids: ITreeNodeItem["id"][] = [];

  const traverse = (items: ITreeNodeItem[]) => {
    for (const item of items) {
      if (item.children && item.children.length > 0) {
        ids.push(item.id);
        traverse(item.children);
      }
    }
  };

  traverse(nodes);
  return ids;
};

/**
 * Recursively collects all IDs from tree nodes and their descendants.
 * Unlike getAllExpandableIds, this includes ALL nodes (not just those with children).
 */
export const getAllDescendantIds = (
  nodes: ITreeNodeItem[],
): Set<ITreeNodeItem["id"]> => {
  const ids = new Set<ITreeNodeItem["id"]>();

  const traverse = (items: ITreeNodeItem[]) => {
    for (const item of items) {
      ids.add(item.id);
      if (item.children && item.children.length > 0) {
        traverse(item.children);
      }
    }
  };

  traverse(nodes);
  return ids;
};
