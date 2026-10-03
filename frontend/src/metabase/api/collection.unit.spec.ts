import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { findRequests } from "__support__/server-mocks";
import {
  createMockBookmark,
  createMockCollection,
} from "metabase-types/api/mocks";

import { Api } from "./api";
import { bookmarkApi } from "./bookmark";
import { collectionApi } from "./collection";

let activeStore: ReturnType<typeof getStore> | undefined;

const BOOKMARK_COLLECTION_ID = 10;

function setupBookmarks() {
  fetchMock.get("path:/api/bookmark", [
    createMockBookmark({
      id: "card-1",
      type: "card",
      item_id: 1,
      name: "Orders in First Collection",
    }),
  ]);

  fetchMock.put(`path:/api/collection/${BOOKMARK_COLLECTION_ID}`, () =>
    createMockCollection({
      id: BOOKMARK_COLLECTION_ID,
      name: "First collection",
      archived: true,
    }),
  );

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;

  return { store };
}

async function countBookmarkRequests() {
  const gets = await findRequests("GET");
  return gets.filter((request) => request.url.includes("/api/bookmark")).length;
}

describe("collectionApi bookmark cache invalidation (metabase#44499)", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  it("refetches the bookmarks list after archiving a collection", async () => {
    const { store } = setupBookmarks();

    // Keep a subscription, as the open sidebar would, so invalidating the bookmark list tag triggers a refetch.
    store.dispatch(bookmarkApi.endpoints.listBookmarks.initiate());
    await waitFor(async () => {
      expect(await countBookmarkRequests()).toBe(1);
    });

    await store.dispatch(
      collectionApi.endpoints.updateCollection.initiate({
        id: BOOKMARK_COLLECTION_ID,
        archived: true,
      }),
    );

    await waitFor(async () => {
      expect(await countBookmarkRequests()).toBe(2);
    });
  });
});
