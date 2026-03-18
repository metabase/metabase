import type { Collection, CollectionItem } from "metabase-types/api";

export function isRootPersonalCollection(
  collection: Partial<Collection> | CollectionItem,
): boolean {
  return typeof collection.personal_owner_id === "number";
}

export function isRootTrashCollection(
  collection?: Pick<Collection, "type">,
): boolean {
  return collection?.type === "trash";
}
