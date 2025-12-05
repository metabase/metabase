import { ItemList } from "metabase/common/components/EntityPicker/components/ItemList";
import type {
  CollectionItemListProps,
  CollectionPickerItem,
} from "metabase/common/components/Pickers/CollectionPicker/types";
import { useListRootTenantCollectionItemsQuery } from "metabase-enterprise/api";

export const TenantCollectionItemList = ({
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
  } = useListRootTenantCollectionItemsQuery<{
    data: {
      data: CollectionPickerItem[];
    };
    error: any;
    isLoading: boolean;
  }>();

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
