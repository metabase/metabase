import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import { PLUGIN_TENANTS } from "metabase/plugins";

import type { CollectionItemListProps } from "../types";

import { CollectionItemList } from "./CollectionItemList";
import { DashboardItemList } from "./DashboardItemList";
import { PersonalCollectionsItemList } from "./PersonalCollectionItemList";
import { RootItemList } from "./RootItemList";

export const CollectionItemPickerResolver = ({
  onClick,
  selectedItem,
  options,
  query,
  isFolder,
  isCurrentLevel,
  shouldDisableItem,
  shouldShowItem,
  entity = "collection",
}: CollectionItemListProps) => {
  if (!query) {
    return (
      <RootItemList
        options={options}
        selectedItem={selectedItem}
        onClick={onClick}
        isFolder={isFolder}
        isCurrentLevel={isCurrentLevel}
        shouldDisableItem={shouldDisableItem}
        shouldShowItem={shouldShowItem}
      />
    );
  }

  if (query.id === PERSONAL_COLLECTIONS.id) {
    return (
      <PersonalCollectionsItemList
        onClick={onClick}
        selectedItem={selectedItem}
        isFolder={isFolder}
        isCurrentLevel={isCurrentLevel}
        shouldDisableItem={shouldDisableItem}
        shouldShowItem={shouldShowItem}
        options={options}
      />
    );
  }

  if (query.id === "tenant") {
    return (
      <PLUGIN_TENANTS.TenantCollectionItemList
        query={query}
        onClick={onClick}
        selectedItem={selectedItem}
        isFolder={isFolder}
        isCurrentLevel={isCurrentLevel}
        shouldDisableItem={shouldDisableItem}
        shouldShowItem={shouldShowItem}
        options={options}
      />
    );
  }

  if (entity === "dashboard") {
    return (
      <DashboardItemList
        query={query}
        onClick={onClick}
        selectedItem={selectedItem}
        isFolder={isFolder}
        isCurrentLevel={isCurrentLevel}
        shouldDisableItem={shouldDisableItem}
        shouldShowItem={shouldShowItem}
        options={options}
      />
    );
  }

  return (
    <CollectionItemList
      query={query}
      onClick={onClick}
      selectedItem={selectedItem}
      isFolder={isFolder}
      isCurrentLevel={isCurrentLevel}
      shouldDisableItem={shouldDisableItem}
      shouldShowItem={shouldShowItem}
      options={options}
    />
  );
};
