import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";

import type { CollectionItemListProps } from "../types";

import { CollectionItemList } from "./CollectionItemList";
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
      options={options}
    />
  );
};
