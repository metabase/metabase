import _ from "underscore";

import { PLUGIN_LIBRARY } from "metabase/plugins";
import type {
  CollectionId,
  CollectionItem,
  CollectionItemModel,
} from "metabase-types/api";

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

export const validCollectionModels = new Set<CollectionItemModel>([
  "collection",
  "dashboard",
  "document",
  "card",
  "dataset",
  "metric",
  "table",
  "snippet",
  "transform",
  "measure",
]);

export const allCollectionModels = Array.from(validCollectionModels);

const isValidCollectionItemModel = (
  model: OmniPickerItem["model"],
): model is CollectionItemModel =>
  // CollectionItemModel is a closed string union; Set.has needs the narrowed type.
  validCollectionModels.has(model as CollectionItemModel);

export const getValidCollectionItemModels = (
  models: OmniPickerItem["model"][],
): CollectionItemModel[] =>
  _.uniq(models.filter(isValidCollectionItemModel).concat(["collection"]));

/** Shared options for collection item requests across EntityPicker and MiniPicker. */
export const getCollectionItemsOptions = ({
  models,
}: {
  models: OmniPickerItem["model"][];
}) => {
  return {
    models: getValidCollectionItemModels(models),
    include_can_run_adhoc_query: models.includes("table"),
    // After a downgrade from EE to OSS, isEnabled is false, and we want to show
    // the Library (if it exists) within Our Analytics.
    include_library: !PLUGIN_LIBRARY.isEnabled,
  };
};
