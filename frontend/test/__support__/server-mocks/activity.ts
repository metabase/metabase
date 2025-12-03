import fetchMock, { type UserRouteConfig } from "fetch-mock";

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
  routeConfig: UserRouteConfig = {},
  mockPostRequest: boolean = true,
) {
  fetchMock.get({
    url: "path:/api/activity/recents",
    query: {
      context,
    },
    response: {
      status: 200,
      body: { recents: recentItems },
    },
    ...routeConfig,
  });

  if (mockPostRequest) {
    fetchMock.post("path:/api/activity/recents", 200);
  }
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
