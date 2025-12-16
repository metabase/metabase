import { skipToken, useListDashboardItemsQuery } from "metabase/api";

import { ItemList } from "../..";
import type {
  CollectionItemListProps,
  CollectionPickerItem,
} from "../../../Pickers/CollectionPicker/types";

export const DashboardItemList = ({
  parentItem,
  pathIndex,
}: {
  parentItem: CollectionPickerItem;
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
