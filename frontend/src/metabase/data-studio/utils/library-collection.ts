import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { CollectionId } from "metabase-types/api";

// FIXME: REMOVE, THIS IS A HACK FOR DEMO PURPOSES
// Backend should provide a property to identify the special Library collection
export function findLibraryCollection(
  collections: ITreeNodeItem[],
): ITreeNodeItem | null {
  let libraryCollection: ITreeNodeItem | null = null;
  let highestId = -1;

  const searchTree = (items: ITreeNodeItem[]) => {
    for (const item of items) {
      if (item.name === "Library") {
        const itemId = typeof item.id === "number" ? item.id : -Infinity;
        if (itemId > highestId) {
          highestId = itemId;
          libraryCollection = item;
        }
      }
      if (item.children) {
        searchTree(item.children);
      }
    }
  };

  searchTree(collections);
  return libraryCollection;
}

// FIXME: REMOVE, THIS IS A HACK FOR DEMO PURPOSES
// Backend should provide a property to identify the special Library collection
export function findLibraryCollectionId(
  collections: ITreeNodeItem[],
): CollectionId | null {
  const collection = findLibraryCollection(collections);
  return collection?.id ?? null;
}

// FIXME: REMOVE, THIS IS A HACK FOR DEMO PURPOSES
// Backend should provide a property to identify the special Library collection
export function excludeLibrarySubtree(
  collections: ITreeNodeItem[],
): ITreeNodeItem[] {
  const libraryIdToExclude = findLibraryCollectionId(collections);

  if (libraryIdToExclude === null) {
    return collections;
  }

  return collections.map((collection) => {
    const filteredChildren = collection.children
      ? collection.children.filter((child) => child.id !== libraryIdToExclude)
      : undefined;

    return {
      ...collection,
      children: filteredChildren,
    };
  });
}

// FIXME: REMOVE, THIS IS A HACK FOR DEMO PURPOSES
// Backend should provide a property to identify the special Library collections
export function getLibraryInitialExpandedIds(
  libraryCollection: ITreeNodeItem,
): (string | number)[] {
  const expandedIds: (string | number)[] = [libraryCollection.id];

  const expandSpecialCollections = (
    item: ITreeNodeItem,
    parentName?: string,
  ) => {
    if (!item.children) {
      return;
    }

    for (const child of item.children) {
      const isSemanticLayer = child.name === "Semantic layer";
      const isModelsOrMetrics =
        parentName === "Semantic layer" &&
        (child.name === "Models" || child.name === "Metrics");

      if (isSemanticLayer || isModelsOrMetrics) {
        expandedIds.push(child.id);
        expandSpecialCollections(child, child.name);
      }
    }
  };

  expandSpecialCollections(libraryCollection);
  return expandedIds;
}
