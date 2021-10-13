import { TreeNodeId } from "./types";

export const getInitialExpandedIds = (
  selectedId: TreeNodeId,
  nodes: Array<any>,
): Array<TreeNodeId> =>
  nodes
    .map<any>(node => {
      if (node.id === selectedId) {
        return [node.id];
      }

      if (node.children) {
        const path = getInitialExpandedIds(selectedId, node.children);
        return path.length > 0 ? [node.id, ...path] : [];
      }
    })
    .filter(id => id)
    .flat();
