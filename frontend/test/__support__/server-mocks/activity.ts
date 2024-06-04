import fetchMock from "fetch-mock";

import type { PopularItem, RecentItem, Dashboard } from "metabase-types/api";

export function setupRecentViewsEndpoints(recentlyViewedItems: RecentItem[]) {
  fetchMock.get(url => url.endsWith("/api/activity/recents?context=views"), {
    recent_views: recentlyViewedItems,
  });
}

export function setupRecentSelectionsEndpoints(
  recentlySelectedItems: RecentItem[],
) {
  fetchMock.get(
    url => url.endsWith("/api/activity/recents?context=selections"),
    {
      recent_selections: recentlySelectedItems,
    },
  );
}

export function setupPopularItemsEndpoints(popularItems: PopularItem[]) {
  fetchMock.get("path:/api/activity/popular_items", {
    popular_items: popularItems,
  });
}

export function setupMostRecentlyViewedDashboard(
  mostRecentlyViewedDashboard?: Dashboard,
) {
  fetchMock.get(
    "path:/api/activity/most_recently_viewed_dashboard",
    mostRecentlyViewedDashboard ?? 204,
  );
}
