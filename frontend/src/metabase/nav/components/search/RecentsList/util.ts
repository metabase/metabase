import * as Urls from "metabase/urls";
import { isSyncCompleted } from "metabase/utils/syncing";
import type { RecentItem } from "metabase-types/api";

export const isItemActive = (item: RecentItem) => {
  if (item.model !== "table") {
    return true;
  }
  return isSyncCompleted(item.database);
};

export const getItemUrl = (item: RecentItem) => {
  const url = isItemActive(item) && Urls.modelToUrl(item);
  return url || undefined;
};

export const recentsFilter = (results: RecentItem[]): RecentItem[] => {
  return results.filter((item) => item.model !== "collection").slice(0, 5);
};
