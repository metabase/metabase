import type { ITreeNodeItem } from "./types";

export const getInitialExpandedIds = (
  selectedId: ITreeNodeItem["id"],
  nodes: ITreeNodeItem[],
): ITreeNodeItem["id"][] =>
  nodes
    .map(node => {
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
