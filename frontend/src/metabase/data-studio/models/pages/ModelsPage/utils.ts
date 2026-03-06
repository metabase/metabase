import type { CollectionEssentials, SearchResult } from "metabase-types/api";

import type { ModelsTreeNode } from "./types";

export function buildModelsTree(
  models: SearchResult<number, "dataset">[],
): ModelsTreeNode[] {
  const collectionMap = new Map<string, ModelsTreeNode>();
  const rootChildren: ModelsTreeNode[] = [];

  for (const model of models) {
    const ancestors = model.collection?.effective_ancestors ?? [];
    const parentCollection = model.collection;

    const fullPath: CollectionEssentials[] = [
      ...ancestors,
      ...(parentCollection ? [parentCollection] : []),
    ];

    let currentChildren = rootChildren;

    for (const ancestor of fullPath) {
      const key = `collection:${ancestor.id}`;
      let collectionNode = collectionMap.get(key);

      if (!collectionNode) {
        collectionNode = {
          id: key,
          type: "collection",
          name: ancestor.name,
          collectionId: ancestor.id,
          children: [],
        };
        collectionMap.set(key, collectionNode);
        currentChildren.push(collectionNode);
      }

      currentChildren = collectionNode.children!;
    }

    currentChildren.push({
      id: `model:${model.id}`,
      type: "model",
      name: model.name,
      description: model.description,
      modelId: model.id,
      collectionId: model.collection?.id ?? null,
      collectionName: model.collection?.name ?? null,
    });
  }

  sortTree(rootChildren);

  return rootChildren;
}

function sortTree(nodes: ModelsTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.type === "collection" && b.type !== "collection") {
      return -1;
    }
    if (a.type !== "collection" && b.type === "collection") {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });

  for (const node of nodes) {
    if (node.children) {
      sortTree(node.children);
    }
  }
}
