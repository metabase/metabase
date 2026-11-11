import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import {
  findRequests,
  setupBookmarksEndpoints,
  setupCreateBookmarkEndpoint,
  setupDeleteBookmarkEndpoint,
} from "__support__/server-mocks";
import type { Bookmark } from "metabase-types/api";
import {
  createMockBookmark,
  createMockCard,
  createMockCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { Api } from "./api";
import { bookmarkApi } from "./bookmark";
import { cardApi } from "./card";
import { collectionApi } from "./collection";
import { dashboardApi } from "./dashboard";

const COLLECTION_BOOKMARK = createMockBookmark({
  id: "collection-1",
  type: "collection",
  item_id: 1,
  name: "First collection",
});

const DASHBOARD_BOOKMARK = createMockBookmark({
  id: "dashboard-2",
  type: "dashboard",
  item_id: 2,
  name: "Orders in a dashboard",
});

const CARD_BOOKMARK = createMockBookmark({
  id: "card-3",
  type: "card",
  item_id: 3,
  name: "Orders",
});

let activeStore: ReturnType<typeof getStore> | undefined;

interface SetupOpts {
  bookmarks?: Bookmark[];
}

async function setup({ bookmarks = [] }: SetupOpts = {}) {
  setupBookmarksEndpoints(bookmarks);

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;

  const bookmarkListCalls = async () =>
    (await findRequests("GET")).filter(
      (request) => new URL(request.url).pathname === "/api/bookmark",
    ).length;

  store.dispatch(bookmarkApi.endpoints.listBookmarks.initiate());
  await waitFor(async () => expect(await bookmarkListCalls()).toBe(1));

  return { store, bookmarkListCalls };
}

describe("bookmarkApi", () => {
  afterEach(() => {
    // Drop the store's RTK Query subscriptions before pulling the fetch routes,
    // otherwise orphaned subscriptions refetch against removed routes.
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  it("refetches the bookmark list after adding a bookmark", async () => {
    setupCreateBookmarkEndpoint({ type: "card", item_id: 3 });
    const { store, bookmarkListCalls } = await setup();

    await store.dispatch(
      bookmarkApi.endpoints.createBookmark.initiate({ id: 3, type: "card" }),
    );

    await waitFor(async () => expect(await bookmarkListCalls()).toBe(2));
  });

  it("refetches the bookmark list after removing a bookmark", async () => {
    setupDeleteBookmarkEndpoint(CARD_BOOKMARK);
    const { store, bookmarkListCalls } = await setup({
      bookmarks: [CARD_BOOKMARK],
    });

    await store.dispatch(
      bookmarkApi.endpoints.deleteBookmark.initiate({ id: 3, type: "card" }),
    );

    await waitFor(async () => expect(await bookmarkListCalls()).toBe(2));
  });

  describe("renaming a bookmarked item refetches the bookmark list", () => {
    it("for a collection", async () => {
      fetchMock.put(
        "path:/api/collection/1",
        createMockCollection({ id: 1, name: "First collection 2" }),
      );
      const { store, bookmarkListCalls } = await setup({
        bookmarks: [COLLECTION_BOOKMARK],
      });

      await store.dispatch(
        collectionApi.endpoints.updateCollection.initiate({
          id: 1,
          name: "First collection 2",
        }),
      );

      await waitFor(async () => expect(await bookmarkListCalls()).toBe(2));
    });

    it("for a dashboard", async () => {
      fetchMock.put(
        "path:/api/dashboard/2",
        createMockDashboard({ id: 2, name: "Orders in a dashboard 2" }),
      );
      const { store, bookmarkListCalls } = await setup({
        bookmarks: [DASHBOARD_BOOKMARK],
      });

      await store.dispatch(
        dashboardApi.endpoints.updateDashboard.initiate({
          id: 2,
          name: "Orders in a dashboard 2",
        }),
      );

      await waitFor(async () => expect(await bookmarkListCalls()).toBe(2));
    });

    it("for a question", async () => {
      fetchMock.put(
        "path:/api/card/3",
        createMockCard({ id: 3, name: "Orders 2" }),
      );
      const { store, bookmarkListCalls } = await setup({
        bookmarks: [CARD_BOOKMARK],
      });

      await store.dispatch(
        cardApi.endpoints.updateCard.initiate({ id: 3, name: "Orders 2" }),
      );

      await waitFor(async () => expect(await bookmarkListCalls()).toBe(2));
    });
  });

  it("does not refetch the bookmark list when an item that is not bookmarked is renamed", async () => {
    fetchMock.put(
      "path:/api/dashboard/2",
      createMockDashboard({ id: 2, name: "Orders in a dashboard 2" }),
    );
    fetchMock.put(
      "path:/api/card/3",
      createMockCard({ id: 3, name: "Orders 2" }),
    );
    const { store, bookmarkListCalls } = await setup({
      bookmarks: [CARD_BOOKMARK],
    });

    await store.dispatch(
      dashboardApi.endpoints.updateDashboard.initiate({
        id: 2,
        name: "Orders in a dashboard 2",
      }),
    );
    // Renaming the bookmarked card refetches the list once. Any refetch caused
    // by the dashboard rename starts before it, so it would be counted too.
    await store.dispatch(
      cardApi.endpoints.updateCard.initiate({ id: 3, name: "Orders 2" }),
    );

    await waitFor(async () => expect(await bookmarkListCalls()).toBe(2));
    expect(await bookmarkListCalls()).toBe(2);
  });
});
