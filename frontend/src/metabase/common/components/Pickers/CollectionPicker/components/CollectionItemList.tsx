import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import type { CollectionItemModel } from "metabase-types/api";

import { ItemList } from "../../../EntityPicker";
import type { CollectionItemListProps, CollectionPickerItem } from "../types";

const validModels: CollectionItemModel[] = [
  "collection",
  "dashboard",
  "document",
  "card",
  "dataset",
  "metric",
  "table",
];

const getValidCollectionItemModels = (models?: CollectionItemModel[]) =>
  models ? models.filter((model) => validModels.includes(model)) : undefined;

export const CollectionItemList = ({
  query,
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
  shouldDisableItem,
  shouldShowItem,
}: CollectionItemListProps) => {
  const {
    data: items,
    error,
    isLoading,
  } = useListCollectionItemsQuery<{
    data: {
      data: CollectionPickerItem[];
    };
    error: any;
    isLoading: boolean;
  }>(
    query
      ? {
          ...query,
          models: getValidCollectionItemModels(query.models),
          include_can_run_adhoc_query: true,
        }
      : skipToken,
  );

  return (
    <ItemList
      items={items?.data}
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
