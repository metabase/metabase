import { PLUGIN_LIBRARY } from "metabase/plugins";
import type { CollectionItemModel, CollectionType } from "metabase-types/api";

/** Everything the placement rules need to know about a destination collection. `is_library_root`
 *  matters because the seeded Library root and a user-created Library folder share `type: "library"`
 *  but hold completely different things. */
export type CollectionPlacementTarget = {
  type?: CollectionType | null;
  is_library_root?: boolean | null;
};

export function canPlaceEntityInCollection(
  entityType: CollectionItemModel,
  target: CollectionPlacementTarget,
): boolean {
  const { type } = target;

  if (!PLUGIN_LIBRARY.isLibraryCollectionType(type)) {
    return true;
  }

  if (type === "library") {
    // The seeded Library root is a pure container. Folders the user creates under it hold the
    // library's actual content.
    return target.is_library_root
      ? entityType === "collection"
      : entityType === "collection" ||
          entityType === "table" ||
          entityType === "metric";
  }

  if (type === "library-data") {
    return entityType === "table" || entityType === "collection";
  }

  if (type === "library-metrics") {
    return entityType === "metric" || entityType === "collection";
  }

  return false;
}

export function canPlaceEntityInCollectionOrDescendants(
  entityType: CollectionItemModel,
  target: CollectionPlacementTarget,
): boolean {
  if (canPlaceEntityInCollection(entityType, target)) {
    return true;
  }

  if (target.type === "library" && target.is_library_root) {
    return (
      canPlaceEntityInCollection(entityType, { type: "library-data" }) ||
      canPlaceEntityInCollection(entityType, { type: "library-metrics" })
    );
  }

  return false;
}
