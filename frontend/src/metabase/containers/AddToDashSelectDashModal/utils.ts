import { isPublicCollection } from "metabase/collections/utils";
import type { DashboardPickerItem } from "metabase/common/components/DashboardPicker";
import { ROOT_COLLECTION } from "metabase/entities/collections/constants";
import type { Dashboard, RecentItem, SearchResult } from "metabase-types/api";

export function isInPublicCollection(dashboard: Dashboard | undefined) {
  return isPublicCollection(dashboard?.collection ?? ROOT_COLLECTION);
}

export const shouldDisableItem = (item: DashboardPickerItem) => {
  return item.model === "dashboard" && item.can_write === false;
};

export const filterWritableDashboards = (
  dashes: SearchResult[],
): SearchResult[] => {
  return dashes.filter(dash => dash.can_write);
};

export const filterWritableRecents = (dashes: RecentItem[]) => {
  return dashes.filter(dash => dash.model !== "table" && dash.can_write);
};
