import { useListCollectionItemsQuery } from "metabase/api";
import { ItemList } from "metabase/common/components/EntityPicker/components/ItemList";
import type {
  CollectionItemListProps,
  CollectionPickerItem,
} from "metabase/common/components/Pickers/CollectionPicker/types";

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
  } = useListCollectionItemsQuery({
    id: "root",
    namespace: "shared-tenant-collection",
  });

  return (
    <ItemList
      items={collectionItems?.data as CollectionPickerItem[] | undefined}
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
