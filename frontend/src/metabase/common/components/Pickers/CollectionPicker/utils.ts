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
): CollectionId => {
  const parentCollectionId = location?.split("/").filter(Boolean).reverse()[0];
  return parentCollectionId ? Number(parentCollectionId) : "root";
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

  const parentCollectionId =
    item.collection_id ??
    getParentCollectionId(item?.effective_location ?? item?.location);

  // set selected item at the correct level
  const pathLevel = path.findIndex(
    (level) => String(level?.query?.id) === String(parentCollectionId),
  );

  return pathLevel === -1 ? 0 : pathLevel;
};
