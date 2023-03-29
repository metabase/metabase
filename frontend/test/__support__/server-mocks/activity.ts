import fetchMock from "fetch-mock";
import type { RecentItem } from "metabase-types/api";

export function setupRecentViewsEndpoints(recentlyViewedItems: RecentItem[]) {
  fetchMock.get("path:/api/activity/recent_views", recentlyViewedItems);
}
