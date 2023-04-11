import fetchMock from "fetch-mock";
import type { PopularItem, RecentItem } from "metabase-types/api";

export function setupRecentViewsEndpoints(recentlyViewedItems: RecentItem[]) {
  fetchMock.get("path:/api/activity/recent_views", recentlyViewedItems);
}

export function setupPopularItemsEndpoints(popularItems: PopularItem[]) {
  fetchMock.get("path:/api/activity/popular_items", popularItems);
}
