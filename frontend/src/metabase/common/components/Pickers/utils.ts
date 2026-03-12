import type { CollectionId, CollectionItem } from "metabase-types/api";

import type { OmniPickerCollectionItem, OmniPickerItem } from "./EntityPicker";

/**
 * check if a card can be used as the starting point for a new query
 */
export const canCollectionCardBeUsed = (
  item: CollectionItem | OmniPickerItem,
): boolean => {
  if (item.model === "card") {
    return "can_run_adhoc_query" in item ? !!item.can_run_adhoc_query : true;
  }

  return true;
};

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
