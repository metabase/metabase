import { ItemList } from "../../EntityPicker";
import { useRootCollectionPickerItems } from "../hooks";
import type { CollectionItemListProps } from "../types";

export const RootItemList = ({
  onClick,
  selectedItem,
  options,
  isFolder,
  isCurrentLevel,
  shouldDisableItem,
  shouldShowItem,
}: CollectionItemListProps) => {
  const { items, isLoading } = useRootCollectionPickerItems(options);

  return (
    <ItemList
      items={items}
      isLoading={isLoading}
      onClick={onClick}
      selectedItem={selectedItem}
      isFolder={isFolder}
      isCurrentLevel={isCurrentLevel}
      shouldDisableItem={shouldDisableItem}
      shouldShowItem={shouldShowItem}
    />
  );
};
