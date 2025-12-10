import { ItemList } from "../..";
import { useRootCollectionPickerItems } from "../../../Pickers/CollectionPicker/hooks";
import type { CollectionItemListProps } from "../../../Pickers/CollectionPicker/types";
import { useOmniPickerContext } from "../../context";

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
