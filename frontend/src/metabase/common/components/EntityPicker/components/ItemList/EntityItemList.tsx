import type { CollectionItem } from "metabase-types/api";
import { useSearchListQuery } from "metabase/common/hooks";

import { ItemList } from "./ItemList";

export interface EntityItemListProps {
  query: any;
  onClick: (val: any) => void;
  selectedItem: CollectionItem | null;
  folderModel: string;
}

export const EntityItemList = ({
  query,
  onClick,
  selectedItem,
  folderModel,
}: EntityItemListProps) => {
  const { data, isLoading } = useSearchListQuery({ query });

  return (
    <ItemList
      items={data}
      isLoading={isLoading}
      onClick={onClick}
      selectedItem={selectedItem}
      folderModel={folderModel}
    />
  );
};
