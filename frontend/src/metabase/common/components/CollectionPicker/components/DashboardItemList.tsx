import { skipToken, useListDashboardItemsQuery } from "metabase/api";

import { ItemList } from "../../EntityPicker";
import type { CollectionItemListProps, CollectionPickerItem } from "../types";

export const DashboardItemList = ({
  query,
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
  shouldDisableItem,
  shouldShowItem,
}: CollectionItemListProps) => {
  const {
    data: dashboardItems,
    error,
    isLoading,
  } = useListDashboardItemsQuery<{
    data: {
      data: CollectionPickerItem[];
    };
    error: any;
    isLoading: boolean;
  }>(query ? query : skipToken);

  return (
    <ItemList
      items={dashboardItems?.data}
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
