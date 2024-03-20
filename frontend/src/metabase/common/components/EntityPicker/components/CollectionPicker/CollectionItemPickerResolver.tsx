import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";

import { PersonalCollectionsItemList } from "./PersonalCollectionItemList";
import { RootItemList } from "./RootItemList";
import { SearchItemList } from "./SearchItemList";
import type { CollectionItemListProps } from "./types";

export const CollectionItemPickerResolver = ({
  onClick,
  selectedItem,
  options,
  query,
  isFolder,
  isCurrentLevel,
}: CollectionItemListProps) => {
  if (!query) {
    return (
      <RootItemList
        options={options}
        selectedItem={selectedItem}
        onClick={onClick}
        isFolder={isFolder}
        isCurrentLevel={isCurrentLevel}
      />
    );
  }

  if (query.collection === PERSONAL_COLLECTIONS.id) {
    return (
      <PersonalCollectionsItemList
        onClick={onClick}
        selectedItem={selectedItem}
        isFolder={isFolder}
        isCurrentLevel={isCurrentLevel}
        options={options}
      />
    );
  }

  return (
    <SearchItemList
      query={query}
      onClick={onClick}
      selectedItem={selectedItem}
      isFolder={isFolder}
      isCurrentLevel={isCurrentLevel}
      options={options}
    />
  );
};
