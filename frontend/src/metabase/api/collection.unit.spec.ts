import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import {
  findRequests,
  setupBookmarksEndpoints,
  setupCardEndpoints,
  setupRootCollectionItemsEndpoint,
  setupUpdateCollectionEndpoint,
} from "__support__/server-mocks";
import {
  createMockBookmark,
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockCollectionItemFromCollection,
} from "metabase-types/api/mocks";

import { Api } from "./api";
import { bookmarkApi } from "./bookmark";
import { cardApi } from "./card";
import { collectionApi } from "./collection";

let activeStore: ReturnType<typeof getStore> | undefined;

const CHILD_COLLECTION_ID = 10;
const CHILD_CARD_ID = 20;

/**
 * The data source picker lists the items in a collection via
 * `listCollectionItems`. Regression metabase#32252: after archiving a
 * collection or a question, reopening the picker must show fresh sources.
 * That refresh is guaranteed by RTK-Query cache-tag wiring: the items list
 * `providesTags` the per-model `LIST` tags, and the archive mutations
 * `invalidatesTags` those same tags. If either side of that wiring breaks,
 * the picker keeps serving stale (archived) items.
 */
function setup() {
  setupRootCollectionItemsEndpoint({
    rootCollectionItems: [
      createMockCollectionItemFromCollection({
        id: CHILD_COLLECTION_ID,
        name: "My collection",
      }),
      createMockCollectionItem({
        id: CHILD_CARD_ID,
        model: "card",
        name: "My question",
      }),
    ],
  });

  setupUpdateCollectionEndpoint(
    createMockCollection({
      id: CHILD_COLLECTION_ID,
      name: "My collection",
      archived: true,
    }),
  );

  setupCardEndpoints(
    createMockCard({ id: CHILD_CARD_ID, name: "My question" }),
  );

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;

  return { store };
}

async function countItemsRequests() {
  const gets = await findRequests("GET");
  return gets.filter((request) =>
    request.url.includes("/api/collection/root/items"),
  ).length;
}

describe("collectionApi cache invalidation (metabase#32252)", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  it("refetches the collection items list after archiving a collection", async () => {
    const { store } = setup();

    // Keep an active subscription, as the open picker would.
    store.dispatch(
      collectionApi.endpoints.listCollectionItems.initiate({ id: "root" }),
    );
    await waitFor(async () => {
      expect(await countItemsRequests()).toBe(1);
    });

    await store.dispatch(
      collectionApi.endpoints.updateCollection.initiate({
        id: CHILD_COLLECTION_ID,
        archived: true,
      }),
    );

    // Archiving invalidates the collection LIST tag the items query provides,
    // so the still-subscribed items query refetches.
    await waitFor(async () => {
      expect(await countItemsRequests()).toBe(2);
    });
  });

  it("refetches the collection items list after archiving a question", async () => {
    const { store } = setup();

    store.dispatch(
      collectionApi.endpoints.listCollectionItems.initiate({ id: "root" }),
    );
    await waitFor(async () => {
      expect(await countItemsRequests()).toBe(1);
    });

    await store.dispatch(
      cardApi.endpoints.updateCard.initiate({
        id: CHILD_CARD_ID,
        archived: true,
      }),
    );

    // Archiving a card invalidates the card LIST tag the items query provides.
    await waitFor(async () => {
      expect(await countItemsRequests()).toBe(2);
    });
  });
});

const BOOKMARK_COLLECTION_ID = 10;

/**
 * Regression metabase#44499: archiving (or restoring) a collection that
 * contains bookmarked items must refresh the bookmarks sidebar, because those
 * items may become (un)reachable. The refresh is guaranteed by RTK-Query
 * cache-tag wiring: `listBookmarks` provides the bookmark `LIST` tag, and the
 * collection archive/restore mutation invalidates that same tag whenever the
 * payload carries an `archived` field. If that wiring breaks, the sidebar
 * keeps serving stale bookmarks.
 */
function setupBookmarks() {
  setupBookmarksEndpoints([
    createMockBookmark({
      id: "card-1",
      type: "card",
      item_id: 1,
      name: "Orders in First Collection",
    }),
  ]);

  setupUpdateCollectionEndpoint(
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

    // Keep an active subscription, as the open sidebar would.
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

    // Archiving a collection invalidates the bookmark LIST tag the bookmarks
    // query provides, so the still-subscribed bookmarks query refetches.
    await waitFor(async () => {
      expect(await countBookmarkRequests()).toBe(2);
    });
  });
});
