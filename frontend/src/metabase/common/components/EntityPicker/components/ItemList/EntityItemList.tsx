import { useSearchListQuery } from "metabase/common/hooks";
import type {
  CollectionId,
  SearchListQuery,
  SearchModelType,
} from "metabase-types/api";

import type { TisFolder } from "../../types";
import type { CollectionPickerItem } from "../CollectionPicker/types";

import { ItemList } from "./ItemList";

export interface EntityItemListProps {
  query: SearchListQuery;
  onClick: (val: any) => void;
  selectedItem: CollectionPickerItem | null;
  isFolder: TisFolder<CollectionId, SearchModelType, CollectionPickerItem>;
  isCurrentLevel: boolean;
}

export const EntityItemList = ({
  query,
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
}: EntityItemListProps) => {
  const { data, error, isLoading } = useSearchListQuery<CollectionPickerItem>({
    query,
  });

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
