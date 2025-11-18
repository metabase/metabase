import type { LibraryCollectionType } from "metabase/plugins";
import type { CollectionItemModel, CollectionType } from "metabase-types/api";

export function getLibraryCollectionType(
  type: CollectionType | null | undefined,
): LibraryCollectionType | undefined {
  switch (type) {
    case "semantic-layer":
      return "root";
    case "semantic-layer-models":
      return "models";
    case "semantic-layer-metrics":
      return "metrics";
  }
}

export function canPlaceEntityInCollection(
  entityType: CollectionItemModel,
  collectionType: CollectionType | null | undefined,
): boolean {
  if (getLibraryCollectionType(collectionType) == null) {
    return true;
  }

  // Can't create subcollections in any of special collections
  if (entityType === "collection") {
    return false;
  }

  // Can't create anything in the root Library collection
  if (collectionType === "semantic-layer") {
    return false;
  }

  if (collectionType === "semantic-layer-models") {
    return entityType === "dataset";
  }

  if (collectionType === "semantic-layer-metrics") {
    return entityType === "metric";
  }

  return false;
}

export function canPlaceEntityInCollectionOrDescendants(
  entityType: CollectionItemModel,
  collectionType: CollectionType | null | undefined,
): boolean {
  if (canPlaceEntityInCollection(entityType, collectionType)) {
    return true;
  }

  if (collectionType === "semantic-layer") {
    return (
      canPlaceEntityInCollection(entityType, "semantic-layer-models") ||
      canPlaceEntityInCollection(entityType, "semantic-layer-metrics")
    );
  }

  return false;
}
