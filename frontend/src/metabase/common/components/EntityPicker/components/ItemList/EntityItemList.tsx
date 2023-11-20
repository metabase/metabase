import { useSearchListQuery } from "metabase/common/hooks";

import type { TypeWithModel, TisFolder } from "../../types";

import { ItemList } from "./ItemList";

export interface EntityItemListProps<
  TItem extends TypeWithModel,
  TFolder extends TypeWithModel,
> {
  query: any;
  onClick: (val: any) => void;
  selectedItem: TItem | TFolder | null;
  itemName: string;
  isFolder: TisFolder<TItem, TFolder>;
}

export const EntityItemList = <
  TItem extends TypeWithModel,
  TFolder extends TypeWithModel,
>({
  query,
  onClick,
  selectedItem,
  itemName,
  isFolder,
}: EntityItemListProps<TItem, TFolder>) => {
  const { data, isLoading } = useSearchListQuery<TItem | TFolder>({ query });

  return (
    <ItemList
      items={data}
      isLoading={isLoading}
      onClick={onClick}
      selectedItem={selectedItem}
      itemName={itemName}
      isFolder={isFolder}
    />
  );
};
