import { skipToken, useGetCollectionQuery } from "metabase/api";
import { Text } from "metabase/ui";
import type { Card, Dashboard } from "metabase-types/api";

type ContentLocationCellProps = {
  item: Card;
  dashboard: Pick<Dashboard, "id" | "name">;
};

export function ContentLocationCell({
  item,
  dashboard,
}: ContentLocationCellProps) {
  const isSavedToDashboard = item.dashboard_id === dashboard.id;
  const { currentData: collection } = useGetCollectionQuery(
    isSavedToDashboard ? skipToken : { id: item.collection_id ?? "root" },
  );
  const locationName = isSavedToDashboard ? dashboard.name : collection?.name;

  return <Text truncate>{locationName}</Text>;
}
