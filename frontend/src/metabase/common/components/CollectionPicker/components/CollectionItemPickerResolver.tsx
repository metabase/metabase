import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import type { DatabaseId } from "metabase-types/api";

import type { CollectionItemListProps } from "../types";

import { CollectionItemList } from "./CollectionItemList";
import { PersonalCollectionsItemList } from "./PersonalCollectionItemList";
import { RootItemList } from "./RootItemList";

interface Props extends CollectionItemListProps {
  databaseId?: DatabaseId;
}

export const CollectionItemPickerResolver = ({
  databaseId,
  onClick,
  selectedItem,
  options,
  query,
  isFolder,
  isCurrentLevel,
  shouldDisableItem,
}: Props) => {
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
      databaseId={databaseId}
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
