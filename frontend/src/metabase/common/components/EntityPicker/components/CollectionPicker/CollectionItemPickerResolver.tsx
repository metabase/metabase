import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";

import type { EntityPickerOptions } from "../../types";
import { PersonalCollectionsItemList, RootItemList } from "../ItemList";

import { SearchItemList, type SearchItemListProps } from "./SearchItemList";

export const CollectionItemPickerResolver = ({
  onClick,
  selectedItem,
  options,
  query,
  isFolder,
  isCurrentLevel,
}: SearchItemListProps & {
  options: EntityPickerOptions;
}) => {
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
