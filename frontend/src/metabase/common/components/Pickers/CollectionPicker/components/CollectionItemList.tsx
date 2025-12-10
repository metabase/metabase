import { skipToken, useListCollectionItemsQuery } from "metabase/api";

import { ItemList } from "../../../EntityPicker";
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
    data: items,
    error,
    isLoading,
  } = useListCollectionItemsQuery<{
    data: {
      data: CollectionPickerItem[];
    };
    error: any;
    isLoading: boolean;
  }>(query ? {...query, include_can_run_adhoc_query: true,} : skipToken);

  return (
    <ItemList
      items={items?.data}
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
