import { c, t } from "ttag";
import _ from "underscore";

import { PLUGIN_LIBRARY } from "metabase/plugins";
import type { CollectionId, CollectionItemModel } from "metabase-types/api";

import type { OmniPickerCollectionItem, OmniPickerItem } from "./EntityPicker";

/**
 * The name the picker shows for a collection. The Library and its Data
 * section use the main nav's labels ("Data" and "Datasets") instead of their
 * collection names, and the root collection uses `rootName` when given.
 */
export function getPickerCollectionName(
  {
    id,
    name,
    type,
    namespace,
    is_library_root,
  }: {
    id?: unknown;
    name: string;
    // Picker items share `type` with cards ("question", "model", …); only the
    // Library's collection types are relabeled.
    type?: string | null;
    namespace?: string | null;
    is_library_root?: boolean;
  },
  rootName?: string,
): string {
  if (rootName && id === "root" && !namespace) {
    return rootName;
  }
  switch (type) {
    case "library":
      return c("A noun, shown in the sidebar as a navigation link").t`Data`;
    case "library-data":
      // Subfolders share the section's type; only the section is relabeled.
      // PROTOTYPE: was "Tables".
      return is_library_root === false ? name : t`Datasets`;
    default:
      return name;
  }
}

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
  "action",
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
    // After a downgrade from EE to OSS, isEnabled is false, and we want to show
    // the Library (if it exists) within Our Analytics.
    "include-library": !PLUGIN_LIBRARY.isEnabled,
  };
};
