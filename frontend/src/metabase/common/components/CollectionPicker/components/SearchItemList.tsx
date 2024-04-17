import { useSearchListQuery } from "metabase/common/hooks";
import type { SearchModel, SearchRequest } from "metabase-types/api";

import type {
  EntityPickerOptions,
  ListProps,
  TypeWithModel,
} from "../../EntityPicker";
import { ItemList } from "../../EntityPicker";
import type { CollectionPickerItem } from "../types";

export const SearchItemList = <
  Id,
  Model extends SearchModel,
  Item extends TypeWithModel<Id, Model>,
  Query extends SearchRequest,
  Options extends EntityPickerOptions,
>({
  query,
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
  shouldDisableItem,
}: ListProps<Id, Model, Item, Query, Options>) => {
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
      shouldDisableItem={shouldDisableItem}
    />
  );
};
