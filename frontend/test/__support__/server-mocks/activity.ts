import fetchMock from "fetch-mock";

import type { PopularItem, RecentItem, Dashboard } from "metabase-types/api";

// TODO: update these two calls somehow... don't really need both since we have one endpoint

export function setupRecentViewsEndpoints(recentlyViewedItems: RecentItem[]) {
  fetchMock.get(url => url.endsWith("/api/activity/recents?context=views"), {
    recents: recentlyViewedItems,
  });
}

export function setupRecentSelectionsEndpoints(
  recentlySelectedItems: RecentItem[],
) {
  fetchMock.get(
    url => url.endsWith("/api/activity/recents?context=selections,views"),
    {
      recents: recentlySelectedItems,
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
