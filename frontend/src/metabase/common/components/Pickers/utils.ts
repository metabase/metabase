import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import type { CollectionId } from "metabase-types/api";

import type { CollectionPickerItem } from "./CollectionPicker";

export const getCollectionIdPath = (
  collection: Pick<
    CollectionPickerItem,
    "id" | "location" | "is_personal" | "effective_location" | "model"
  >,
  userPersonalCollectionId?: CollectionId,
): CollectionId[] => {
  if (collection.id === null || collection.id === "root") {
    return ["root"];
  }

  if (collection.id === PERSONAL_COLLECTIONS.id) {
    return ["personal"];
  }

  if (typeof collection.id === "string") {
    console.error("Invalid collection id", collection.id);
    return [];
  }

  const location = collection?.effective_location ?? collection?.location;
  const pathFromRoot: CollectionId[] =
    location?.split("/").filter(Boolean).map(Number) ?? [];

  const isInUserPersonalCollection =
    userPersonalCollectionId &&
    (collection.id === userPersonalCollectionId ||
      pathFromRoot.includes(userPersonalCollectionId));

  const id = collection.model === "collection" ? collection.id : -collection.id;

  if (isInUserPersonalCollection) {
    return [...pathFromRoot, id];
  } else if (collection.is_personal) {
    return ["personal", ...pathFromRoot, id];
  } else {
    return ["root", ...pathFromRoot, id];
  }
};
