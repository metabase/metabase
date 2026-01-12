import type {
  CollectionId,
  CollectionItemModel,
  CollectionNamespace,
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
  namespace?: CollectionNamespace | null,
  type?: string | null,
): CollectionId => {
  const parentCollectionId = location?.split("/").filter(Boolean).reverse()[0];
  if (parentCollectionId) {
    return Number(parentCollectionId);
  }

  if (namespace === "shared-tenant-collection") {
    return "tenant";
  }

  if (type === "tenant-specific-root-collection") {
    return "tenant-specific";
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
      item?.type,
    );

  // set selected item at the correct level
  const pathLevel = path.findIndex(
    (level) => String(level?.query?.id) === String(parentCollectionId),
  );

  return pathLevel === -1 ? 0 : pathLevel;
};
