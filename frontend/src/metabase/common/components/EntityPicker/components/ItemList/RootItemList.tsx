import { ItemList } from "../..";
import { useRootCollectionPickerItems } from "../../../Pickers/CollectionPicker/hooks";

export const RootItemList = () => {
  const { items, isLoading } = useRootCollectionPickerItems();

  return (
    <ItemList
      items={items}
      isLoading={isLoading}
      pathIndex={-1}
    />
  );
};
