import type { TreeItem } from "../types";

export function filterTreeByName(nodes: TreeItem[], query: string): TreeItem[] {
  const lowerQuery = query.trim().toLowerCase();

  return nodes.flatMap((node) => {
    if (node.model !== "collection" && node.model !== "empty-state") {
      return node.name.toLowerCase().includes(lowerQuery) ? [node] : [];
    }

    if (node.children) {
      const filteredChildren = filterTreeByName(node.children, query);
      if (filteredChildren.length > 0) {
        return [{ ...node, children: filteredChildren }];
      }
    }

    return [];
  });
}
