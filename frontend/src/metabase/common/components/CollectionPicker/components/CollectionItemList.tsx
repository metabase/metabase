import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import type { CollectionItem } from "metabase-types/api";

import { ItemList } from "../../EntityPicker";
import type { CollectionItemListProps, CollectionPickerItem } from "../types";

export const CollectionItemList = ({
  databaseId,
  query,
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
  shouldDisableItem,
}: CollectionItemListProps) => {
  const {
    data: collectionItems,
    error,
    isLoading,
  } = useListCollectionItemsQuery<{
    data: {
      data: (CollectionPickerItem & Pick<CollectionItem, "database_id">)[];
    };
    error: any;
    isLoading: boolean;
  }>(query ? query : skipToken);

  const items = collectionItems?.data ?? [];
  const filteredItems = items.filter(item => {
    if (
      typeof databaseId === "undefined" ||
      typeof item.database_id === "undefined"
    ) {
      return true;
    }

    return item.database_id === databaseId;
  });

  return (
    <ItemList
      items={filteredItems}
      isLoading={isLoading}
      error={error}
      onClick={onClick}
      selectedItem={selectedItem}
      isFolder={isFolder}
      isCurrentLevel={isCurrentLevel}
      shouldDisableItem={shouldDisableItem}
    />
  );
};
