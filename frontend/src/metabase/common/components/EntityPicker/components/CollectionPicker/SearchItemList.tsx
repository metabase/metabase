import { useSearchListQuery } from "metabase/common/hooks";
import type {
  CollectionId,
  SearchListQuery,
  SearchModelType,
} from "metabase-types/api";

import type { ListProps } from "../../types";
import { ItemList } from "../ItemList";

import type { CollectionPickerItem, CollectionPickerOptions } from "./types";

export type SearchItemListProps = ListProps<
  CollectionId,
  SearchModelType,
  CollectionPickerItem,
  SearchListQuery,
  CollectionPickerOptions
>;

export const SearchItemList = ({
  query,
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
}: SearchItemListProps) => {
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
