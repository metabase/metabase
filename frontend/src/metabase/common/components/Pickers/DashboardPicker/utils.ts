import _ from "underscore";

import type { CollectionId, Dashboard } from "metabase-types/api";

import {
  getParentCollectionId,
  getPathLevelForItem,
} from "../CollectionPicker/utils";

import type {
  DashboardPickerInitialValueItem,
  DashboardPickerItem,
  DashboardPickerStatePath,
} from "./types";

export const getCollectionId = (
  item: DashboardPickerItem | DashboardPickerInitialValueItem | null,
): CollectionId => {
  if (!item) {
    return "root";
  }

  if (
    "collection_id" in item &&
    item.model === "dashboard" &&
    item.collection_id !== undefined
  ) {
    return item.collection_id ?? "root";
  }

  if (item.model === "collection") {
    return (item.id as CollectionId) ?? "root";
  }

  if ("location" in item) {
    return getParentCollectionId(item.effective_location ?? item.location);
  }

  return "root";
};

export const isFolder = (item: DashboardPickerItem) => {
  return (
    item.is_personal ||
    item.id === "root" ||
    (item?.model === "collection" &&
      _.intersection(
        [...(item?.below ?? []), ...(item?.here ?? [])],
        ["dashboard"],
      ).length > 0)
  );
};

export const handleNewDashboard = (
  newDashboard: Dashboard,
  path: DashboardPickerStatePath,
  onItemSelect: (item: DashboardPickerItem) => void,
  userPersonalCollectionId: CollectionId | undefined,
  handleItemSelect: (item: DashboardPickerItem) => void,
  onPathChange: (item: DashboardPickerStatePath) => void,
) => {
  const newCollectionItem: DashboardPickerItem = {
    id: newDashboard.id,
    name: newDashboard.name,
    collection_id: newDashboard.collection_id || "root",
    model: "dashboard",
  };

  // Needed to satisfy type between DashboardPickerItem and the query below.
  const parentCollectionId = getCollectionId(newCollectionItem);

  //Is the parent collection already in the path?
  const isParentCollectionInPath =
    getPathLevelForItem(newCollectionItem, path, userPersonalCollectionId) > 0;

  if (!isParentCollectionInPath) {
    onPathChange([
      ...path,
      {
        query: {
          id: parentCollectionId,
          models: ["collection", "dashboard"],
        },
        selectedItem: newCollectionItem,
      },
    ]);
    onItemSelect(newCollectionItem);
    return;
  }
  handleItemSelect(newCollectionItem);
};
