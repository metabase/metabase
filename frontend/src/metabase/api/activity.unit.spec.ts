import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import {
  findRequests,
  setupCollectionsEndpoints,
  setupMostRecentlyViewedDashboard,
  setupRecentViewsEndpoints,
} from "__support__/server-mocks";
import {
  createMockDashboard,
  createMockRecentCollectionItem,
} from "metabase-types/api/mocks";

import { activityApi } from "./activity";
import { Api } from "./api";
import { collectionApi } from "./collection";
import { idTag, listTag } from "./tags";

let activeStore: ReturnType<typeof getStore> | undefined;

function setup() {
  setupRecentViewsEndpoints([
    createMockRecentCollectionItem({ id: 1, model: "card" }),
  ]);
  setupCollectionsEndpoints({ collections: [] });
  fetchMock.post("path:/api/activity/recents", 200);

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;

  const recentsCalls = async () =>
    (await findRequests("GET")).filter((request) =>
      request.url.includes("/api/activity/recents"),
    ).length;
  const collectionCalls = async () =>
    (await findRequests("GET")).filter((request) =>
      request.url.includes("/api/collection/tree"),
    ).length;

  return { store, recentsCalls, collectionCalls };
}

describe("activityApi", () => {
  afterEach(() => {
    // Drop the store's RTK Query subscriptions before pulling the fetch routes,
    // otherwise orphaned subscriptions refetch against removed routes.
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  describe("logRecentItem invalidation", () => {
    it("refetches the recents list but leaves sibling entity lists untouched", async () => {
      const { store, recentsCalls, collectionCalls } = setup();

      // Two active subscribers: the recents list and an unrelated collection list.
      store.dispatch(activityApi.endpoints.listRecents.initiate());
      store.dispatch(collectionApi.endpoints.listCollectionsTree.initiate());

      await waitFor(async () => expect(await recentsCalls()).toBe(1));
      await waitFor(async () => expect(await collectionCalls()).toBe(1));

      await store.dispatch(
        activityApi.endpoints.logRecentItem.initiate({
          model_id: 1,
          model: "card",
        }),
      );

      // Logging a recent must refetch the recents list...
      await waitFor(async () => expect(await recentsCalls()).toBe(2));

      // ...without invalidating the collection list.
      expect(await collectionCalls()).toBe(1);
    });
  });

  describe("getMostRecentlyViewedDashboard provided tags", () => {
    it("refetches when the dashboard it surfaced is edited elsewhere", async () => {
      const dashboard = createMockDashboard({ id: 42 });
      setupMostRecentlyViewedDashboard(dashboard);

      const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
        Api.middleware,
      ]);
      activeStore = store;

      const dashboardCalls = async () =>
        (await findRequests("GET")).filter((request) =>
          request.url.includes("/api/activity/most_recently_viewed_dashboard"),
        ).length;

      store.dispatch(
        activityApi.endpoints.getMostRecentlyViewedDashboard.initiate(),
      );
      await waitFor(async () => expect(await dashboardCalls()).toBe(1));

      store.dispatch(Api.util.invalidateTags([idTag("dashboard", 42)]));

      await waitFor(async () => expect(await dashboardCalls()).toBe(2));
    });
  });

  describe("listRecents provided tags", () => {
    it("refetches when an entity it surfaced is edited elsewhere", async () => {
      const { store, recentsCalls } = setup();

      store.dispatch(activityApi.endpoints.listRecents.initiate());
      await waitFor(async () => expect(await recentsCalls()).toBe(1));

      // Editing a card/collection invalidates that model's list tag, which
      // recents provides, so stale names never linger in recent lists.
      store.dispatch(Api.util.invalidateTags([listTag("collection")]));

      await waitFor(async () => expect(await recentsCalls()).toBe(2));
    });
  });
});
