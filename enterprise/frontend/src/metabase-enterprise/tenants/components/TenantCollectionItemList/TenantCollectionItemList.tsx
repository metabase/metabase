import { skipToken } from "metabase/api";
import { ItemList } from "metabase/common/components/EntityPicker/components/ItemList";
import type {
  CollectionItemListProps,
  CollectionPickerItem,
} from "metabase/common/components/Pickers/CollectionPicker/types";
import { useListTenantCollectionItemsQuery } from "metabase-enterprise/api";

export const TenantCollectionItemList = ({
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
  } = useListTenantCollectionItemsQuery<{
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
