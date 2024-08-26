import fetchMock from "fetch-mock";
import querystring from "querystring";

import type {
  Dashboard,
  PopularItem,
  RecentContexts,
  RecentItem,
} from "metabase-types/api";

export function setupRecentViewsEndpoints(recentItems: RecentItem[]) {
  fetchMock.get(/\/api\/activity\/recents\?*/, {
    recents: recentItems,
  });
}

export function setupRecentViewsAndSelectionsEndpoints(
  recentItems: RecentItem[],
  context: RecentContexts[] = ["selections", "views"],
) {
  fetchMock.get(
    url =>
      url.endsWith(
        `/api/activity/recents?${querystring.stringify({ context })}`,
      ),
    {
      recents: recentItems,
    },
  );

  fetchMock.post("path:/api/activity/recents", 200);
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
