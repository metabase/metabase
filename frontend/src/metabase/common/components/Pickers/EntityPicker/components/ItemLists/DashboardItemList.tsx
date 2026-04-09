import { skipToken, useListDashboardItemsQuery } from "metabase/api";

import type { OmniPickerItem } from "../../types";

import { ItemList } from "./ItemList";

export const DashboardItemList = ({
  parentItem,
  pathIndex,
}: {
  parentItem: OmniPickerItem;
  pathIndex: number;
}) => {
  const {
    data: dashboardItems,
    error,
    isLoading,
  } = useListDashboardItemsQuery(
    parentItem.id ? { id: parentItem.id } : skipToken,
  );

  return (
    <ItemList
      items={dashboardItems?.data}
      isLoading={isLoading}
      error={error}
      pathIndex={pathIndex}
    />
  );
};
