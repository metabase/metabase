import { isLibraryCollectionType } from "metabase/collections/utils";
import type { Collection } from "metabase-types/api";

export function canPlaceEntityInCollection(
  entityType: string,
  collectionType: Collection["type"],
): boolean {
  if (!isLibraryCollectionType(collectionType)) {
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
