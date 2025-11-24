import _ from "underscore";

import { TablePicker } from "metabase/common/components/Pickers/TablePicker";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";

import type { CollectionItemListProps, CollectionPickerItem } from "../types";

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
  initialValue,
  tablesPath,
  onTablesPathChange,
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

  if (query?.id === "databases") {
    return (
      <TablePicker
        value={initialValue}
        onItemSelect={(i) => onClick(i as unknown as CollectionPickerItem)}
        path={tablesPath}
        onPathChange={onTablesPathChange || _.noop}
        shouldDisableItem={(i) =>
          shouldDisableItem?.(i as unknown as CollectionPickerItem) ||
          !shouldShowItem?.(i as unknown as CollectionPickerItem) ||
          false
        }
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
