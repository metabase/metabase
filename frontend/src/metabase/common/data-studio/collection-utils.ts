import { PLUGIN_LIBRARY } from "metabase/plugins";
import type { CollectionItemModel, CollectionType } from "metabase-types/api";

export function canPlaceEntityInCollection(
  entityType: CollectionItemModel,
  collectionType: CollectionType | null | undefined,
): boolean {
  if (!PLUGIN_LIBRARY.isLibraryCollectionType(collectionType)) {
    return true;
  }

  // Can't create anything in the root Library collection
  if (collectionType === "library") {
    return false;
  }

  if (collectionType === "library-data") {
    return entityType === "table" || entityType === "collection";
  }

  if (collectionType === "library-metrics") {
    return entityType === "metric" || entityType === "collection";
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

  if (collectionType === "library") {
    return (
      canPlaceEntityInCollection(entityType, "library-data") ||
      canPlaceEntityInCollection(entityType, "library-metrics")
    );
  }

  return false;
}
