import type { CollectionId } from "metabase-types/api";

import type { OmniPickerCollectionItem } from "./EntityPicker";

/**
 * Returns true if the item is the collection itself or a descendant of it.
 * Used to prevent circular references when moving or editing collections.
 */
export function isItemInCollectionOrItsDescendants(
  item: Pick<
    OmniPickerCollectionItem,
    "id" | "effective_location" | "location"
  >,
  collectionId: CollectionId | undefined,
): boolean {
  if (collectionId === undefined) {
    return false;
  }

  const location = item.effective_location ?? item.location;
  return (
    item.id === collectionId ||
    location?.split("/").includes(String(collectionId)) === true
  );
}
