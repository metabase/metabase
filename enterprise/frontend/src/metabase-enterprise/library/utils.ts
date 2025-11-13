import type { LibraryCollectionType } from "metabase/plugins";
import type {
  Collection,
  CollectionItemModel,
  CollectionType,
} from "metabase-types/api";

export function getLibraryCollectionType(
  type: CollectionType | undefined | null,
): LibraryCollectionType | undefined {
  switch (type) {
    case "library":
      return "root";
    case "library-models":
      return "models";
    case "library-metrics":
      return "metrics";
  }
}

export function canPlaceEntityInCollection(
  entityType: CollectionItemModel,
  collectionType: CollectionType | undefined | null,
): boolean {
  if (getLibraryCollectionType(collectionType) == null) {
    return true;
  }

  // Can't create subcollections in any of special collections
  if (entityType === "collection") {
    return false;
  }

  // Can't create anything in the root Library collection
  if (collectionType === "library") {
    return false;
  }

  if (collectionType === "library-models") {
    return entityType === "dataset";
  }

  if (collectionType === "library-metrics") {
    return entityType === "metric";
  }

  return false;
}

export function canPlaceEntityInCollectionOrDescendants(
  entityType: CollectionItemModel,
  collectionType: Collection["type"],
): boolean {
  if (canPlaceEntityInCollection(entityType, collectionType)) {
    return true;
  }

  if (collectionType === "library") {
    return (
      canPlaceEntityInCollection(entityType, "library-models") ||
      canPlaceEntityInCollection(entityType, "library-metrics")
    );
  }

  return false;
}
