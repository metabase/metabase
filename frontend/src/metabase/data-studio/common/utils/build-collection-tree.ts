import type { Collection, CollectionId } from "metabase-types/api";

import type { TreeItem } from "../types";

type CollectionTreeLeaf = {
  collection_id?: CollectionId | null;
};

/**
 * The folders directly under `parentId`, each with its own subtree, followed by the leaves directly under it. Pass
 * `null` for the top level.
 */
export function buildCollectionTreeChildren<Leaf extends CollectionTreeLeaf>(
  parentId: CollectionId | null,
  collections: Collection[],
  leaves: Leaf[],
  createLeafNode: (leaf: Leaf) => TreeItem,
): TreeItem[] {
  return [
    ...collections
      .filter((collection) => collection.parent_id === parentId)
      .map((child) =>
        buildCollectionTreeNode(child, collections, leaves, createLeafNode),
      ),
    ...leaves
      .filter((leaf) => leaf.collection_id === parentId)
      .map(createLeafNode),
  ];
}

/**
 * A folder row for `collection` with the folders and leaves under it as children, or no children when it holds none.
 */
export function buildCollectionTreeNode<Leaf extends CollectionTreeLeaf>(
  collection: Collection,
  collections: Collection[],
  leaves: Leaf[],
  createLeafNode: (leaf: Leaf) => TreeItem,
): TreeItem {
  const children = buildCollectionTreeChildren(
    collection.id,
    collections,
    leaves,
    createLeafNode,
  );

  return {
    id: `collection:${collection.id}`,
    name: collection.name,
    model: "collection",
    icon: "folder",
    data: { ...collection, model: "collection" },
    children: children.length > 0 ? children : undefined,
  };
}
