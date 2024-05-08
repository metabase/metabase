import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import { isNullOrUndefined } from "metabase/lib/types";
import type { CollectionItem, DatabaseId } from "metabase-types/api";

import { ItemList } from "../../EntityPicker";
import type { CollectionItemListProps, CollectionPickerItem } from "../types";

interface Props extends CollectionItemListProps {
  databaseId?: DatabaseId;
}

export const CollectionItemList = ({
  databaseId,
  query,
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
  shouldDisableItem,
}: Props) => {
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
    if (isNullOrUndefined(databaseId) || isNullOrUndefined(item.database_id)) {
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
