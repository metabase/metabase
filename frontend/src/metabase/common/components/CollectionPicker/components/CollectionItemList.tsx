import { skipToken, useListCollectionItemsQuery } from "metabase/api";

import { ItemList } from "../../EntityPicker";
import type { CollectionItemListProps, CollectionPickerItem } from "../types";

export const CollectionItemList = ({
  query,
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
  shouldDisableItem,
  shouldShowItem,
}: CollectionItemListProps) => {
  const {
    data: collectionItems,
    error,
    isLoading,
  } = useListCollectionItemsQuery<{
    data: {
      data: CollectionPickerItem[];
    };
    error: any;
    isLoading: boolean;
  }>(query ? query : skipToken);

  return (
    <ItemList
      items={collectionItems?.data}
      isLoading={isLoading}
      error={error}
      onClick={onClick}
      selectedItem={selectedItem}
      isFolder={isFolder}
      isCurrentLevel={isCurrentLevel}
      shouldDisableItem={shouldDisableItem}
      shouldShowItem={shouldShowItem}
    />
  );
};
