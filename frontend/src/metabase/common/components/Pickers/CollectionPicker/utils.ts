import type {
  CollectionId,
  CollectionItemModel,
  ListCollectionItemsRequest,
} from "metabase-types/api";

import type { PickerState } from "../../EntityPicker";
import type { QuestionPickerItem } from "../QuestionPicker";

import type { CollectionPickerItem } from "./types";

export const isFolderFactory =
  (models: CollectionItemModel[]) =>
  (item: CollectionPickerItem): boolean => {
    return Boolean(
      item.model === "collection" &&
        models.some((model) => item?.here?.includes(model)),
    );
  };

export const getParentCollectionId = (
  location?: string | null,
  namespace?: string | null,
): CollectionId => {
  const parentCollectionId = location?.split("/").filter(Boolean).reverse()[0];
  if (parentCollectionId) {
    return Number(parentCollectionId);
  }
  if (namespace === "shared-tenant-collection") {
    return "tenant";
  }
  return "root";
};

export const getPathLevelForItem = (
  item: CollectionPickerItem | QuestionPickerItem,
  path: PickerState<
    CollectionPickerItem | QuestionPickerItem,
    ListCollectionItemsRequest
  >,
  userPersonalCollectionId?: CollectionId,
): number => {
  if (item.model === "collection" && item.id === userPersonalCollectionId) {
    return 0;
  }

  if (item.model === "table") {
    // we can ignore this, it's not actually in the collection hierarchy
    return 0;
  }

  const parentCollectionId =
    item.collection_id ??
    getParentCollectionId(
      item?.effective_location ?? item?.location,
      item?.namespace,
    );

  // set selected item at the correct level
  const pathLevel = path.findIndex(
    (level) => String(level?.query?.id) === String(parentCollectionId),
  );

  return pathLevel === -1 ? 0 : pathLevel;
};
