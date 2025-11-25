import type { ColorName } from "metabase/lib/colors/types";
import { type IconData, getIcon } from "metabase/lib/icon";
import type {
  CollectionItemModel,
  CollectionNamespace,
  CollectionType,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import {
  type EntityPickerProps,
  type OmniPickerCollectionItem,
  type OmniPickerFolderItem,
  OmniPickerFolderModel,
  type OmniPickerItem,
  type PickerItemFunctions,
} from "./types";

export const getEntityPickerIcon = (
  item: OmniPickerItem,
  {
    isSelected,
    isTenantUser,
  }: {
    isSelected?: boolean;
    isTenantUser?: boolean;
  } = {},
): IconData & { c?: ColorName } => {
  const icon = getIcon(item, { isTenantUser });

  if (item.id === "search-results") {
    icon.name = "search";
  }

  if (isSelected && !icon.color) {
    icon.color = "text-primary-inverse";
  }

  if (icon.name === "folder" && isSelected) {
    icon.name = "folder_filled";
  }

  if (item.id === "recents") {
    icon.name = "clock";
  }

  return { ...icon, color: undefined, c: icon.color ?? "brand" };
};

const isSameNamespace = (
  item1: OmniPickerItem,
  item2: OmniPickerItem,
): boolean => {
  if (!("namespace" in item1) || !("namespace" in item2)) {
    return true;
  }

  return item1.namespace === item2.namespace;
};

export const isSelectedItem = (
  item: OmniPickerItem,
  selectedItem: OmniPickerItem | null,
): boolean => {
  return (
    !!selectedItem &&
    item.id === selectedItem.id &&
    item.model === selectedItem.model &&
    isSameNamespace(item, selectedItem)
  );
};

const isValidItem = (item: unknown): item is OmniPickerItem => {
  return (
    isObject(item) &&
    "model" in item &&
    typeof item.model === "string" &&
    !!item.id
  );
};

/**
 * Given a set of models and optional custom functions,
 * return a complete set of item functions for the EntityPicker to use.
 *
 * Custom functions can narrow the result set, but cannot expand it.
 */

export function getItemFunctions({
  models,
  isFolderItem,
  isHiddenItem,
  isDisabledItem,
  isSelectableItem,
}: {
  models: EntityPickerProps["models"];
} & Partial<PickerItemFunctions>): PickerItemFunctions {
  const modelSet = new Set(models);

  const isFolderBase = (item: OmniPickerItem | unknown) => {
    if (!isValidItem(item)) {
      return false;
    }

    if (
      item.model === OmniPickerFolderModel.Database ||
      item.model === OmniPickerFolderModel.Schema
    ) {
      return true;
    }

    if (item.model === OmniPickerFolderModel.Collection) {
      if (!("here" in item) && !("below" in item)) {
        return false;
      }

      const hereBelowSet = Array.from(
        new Set([
          ...("here" in item && Array.isArray(item.here) ? item.here : []),
          ...("below" in item && Array.isArray(item.below) ? item.below : []),
        ]),
      );

      if (hereBelowSet.some((hereBelowModel) => modelSet.has(hereBelowModel))) {
        return true;
      }
    }

    return false;
  };

  const isFolder = (item: OmniPickerItem): item is OmniPickerFolderItem =>
    isFolderBase(item) && (isFolderItem ? isFolderItem(item) : true);

  // selectable should be narrower than hidden or disabled because
  // intermediate items should not be disabled, but can't ultimately be selected
  const isSelectableBase = (item: OmniPickerItem) => {
    if (!isValidItem(item)) {
      return false;
    }

    return modelSet.has(item.model);
  };

  const isSelectable = (item: OmniPickerItem) =>
    isSelectableBase(item) &&
    (isSelectableItem ? isSelectableItem(item) : true);

  const isHiddenBase = (item: OmniPickerItem) => {
    if (!isValidItem(item)) {
      return true;
    }

    return !modelSet.has(item.model) && !isFolder(item);
  };

  const isHidden = (item: OmniPickerItem) =>
    isHiddenBase(item) || (isHiddenItem ? isHiddenItem(item) : false);

  const isDisabledBase = (item: OmniPickerItem) => {
    if (!isValidItem(item)) {
      return true;
    }

    return false;
  };

  const isDisabled = (item: OmniPickerItem) =>
    isDisabledBase(item) || (isDisabledItem ? isDisabledItem(item) : false);

  return {
    isFolderItem: isFolder,
    isHiddenItem: isHidden,
    isDisabledItem: isDisabled,
    isSelectableItem: isSelectable,
  };
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
]);

export const allCollectionModels = Array.from(validCollectionModels);

const isValidModel = (
  model: OmniPickerItem["model"],
): model is CollectionItemModel =>
  validCollectionModels.has(model as CollectionItemModel);

export const getValidCollectionItemModels = (
  models: OmniPickerItem["model"][],
): CollectionItemModel[] => models.filter(isValidModel).concat(["collection"]); // always show folder models, TODO: what about dashboards?

export const isCollection = (
  item: OmniPickerItem,
): item is OmniPickerCollectionItem => item.model === "collection";

const isCollectionWithType = (
  item: OmniPickerCollectionItem,
): item is OmniPickerCollectionItem & {
  type: CollectionType;
  model: "collection";
} => {
  return item.model === "collection" && typeof item.type === "string";
};

/**
 * Returns the collection type for an item.
 * Recent items and search results use `collection_type` field,
 * while regular collection picker items use `type` field.
 *
 * The entity picker normalizes all of these onto the "type" field,
 * which overlaps with question types
 */
export function getCollectionType(
  item: OmniPickerCollectionItem,
): CollectionType | null {
  if (isCollectionWithType(item)) {
    return item.type;
  }
  return null;
}

const namespaceMap: Record<string, CollectionNamespace[]> = {
  normal: [null, "analytics", "shared-tenant-collection", "tenant-specific"],
  snippet: ["snippets"],
  transform: ["transforms"],
};

export const getNamespacesFromModels = (
  models: OmniPickerItem["model"][],
): CollectionNamespace[] => {
  const modelNamespaces: CollectionNamespace[] = [];
  if (models.includes("snippet")) {
    modelNamespaces.push(...namespaceMap.snippet);
  }

  if (models.includes("transform")) {
    modelNamespaces.push(...namespaceMap.transform);
  }

  if (models.some((model) => model !== "snippet" && model !== "transform")) {
    modelNamespaces.push(...namespaceMap.normal);
  }

  return modelNamespaces;
};

export const getValidNamespaces = (
  movingItem?: OmniPickerCollectionItem,
): CollectionNamespace[] => {
  if (!movingItem) {
    return namespaceMap.normal;
  }

  if (movingItem.model === "collection") {
    // collections cannot move between namespaces
    return [movingItem.namespace ?? null];
  }

  if (movingItem.namespace === "snippets") {
    return namespaceMap.snippet;
  }

  if (movingItem.namespace === "transforms") {
    return namespaceMap.transform;
  }

  return namespaceMap.normal;
};

export const isInRecentsOrSearch = (path: OmniPickerItem[]) => {
  return (
    path[0] && (path[0].id === "recents" || path[0].id === "search-results")
  );
};
