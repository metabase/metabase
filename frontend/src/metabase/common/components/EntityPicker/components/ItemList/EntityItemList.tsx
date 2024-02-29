import { useSearchListQuery } from "metabase/common/hooks";

import type { TypeWithModel, TisFolder } from "../../types";

import { ItemList } from "./ItemList";

export interface EntityItemListProps<TItem extends TypeWithModel> {
  query: any;
  onClick: (val: any) => void;
  selectedItem: TItem | null;
  isFolder: TisFolder<TItem>;
  isCurrentLevel: boolean;
}

export const EntityItemList = <TItem extends TypeWithModel>({
  query,
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
}: EntityItemListProps<TItem>) => {
  const { data, error, isLoading } = useSearchListQuery<TItem>({ query });

  return (
    <ItemList
      items={data}
      isLoading={isLoading}
      error={error}
      onClick={onClick}
      selectedItem={selectedItem}
      isFolder={isFolder}
      isCurrentLevel={isCurrentLevel}
    />
  );
};
