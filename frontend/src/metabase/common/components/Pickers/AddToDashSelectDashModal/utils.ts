import { PLUGIN_LIBRARY } from "metabase/plugins";
import type { CollectionId } from "metabase-types/api";

import type { OmniPickerItem } from "../EntityPicker";

// library collections and their descendants all carry a library type, and
// searched and recent dashboards carry their collection's type
export const isInLibrary = (item: OmniPickerItem) => {
  if (item.model === "collection") {
    return PLUGIN_LIBRARY.isLibraryCollectionType(item.type);
  }
  const collection =
    item.model === "dashboard" && "collection" in item
      ? item.collection
      : undefined;
  if (collection != null && "type" in collection) {
    return (
      typeof collection.type === "string" &&
      PLUGIN_LIBRARY.isLibraryCollectionType(collection.type)
    );
  }
  return false;
};

export const isInPersonalCollection = (
  dash: OmniPickerItem,
  personalCollectionId: CollectionId,
) => {
  if ("is_personal" in dash && dash.is_personal != null) {
    return dash.is_personal;
  }
  if ("location" in dash && !!dash.location) {
    return dash.location.split("/")[1] === String(personalCollectionId);
  }
  return false;
};
