import { waitFor } from "@testing-library/react";

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
const BOOKMARK_COLLECTION_ID = 30;

function setupItems() {
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

describe("archive cache invalidation", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
  });

  // Archiving a collection or question must invalidate the per-model LIST tags
  // that `listCollectionItems` provides, so a subscribed items query refetches
  // and the data source picker never keeps offering an archived source.
  describe("collection items list (metabase#32252)", () => {
    it("refetches after archiving a collection", async () => {
      const { store } = setupItems();

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

      await waitFor(async () => {
        expect(await countItemsRequests()).toBe(2);
      });
    });

    it("refetches after archiving a question", async () => {
      const { store } = setupItems();

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

      await waitFor(async () => {
        expect(await countItemsRequests()).toBe(2);
      });
    });
  });

  // Archiving a collection can make bookmarked items unreachable, so the
  // `updateCollection` mutation must invalidate the bookmark LIST tag that
  // `listBookmarks` provides, letting a subscribed bookmarks query refetch.
  describe("bookmarks list (metabase#44499)", () => {
    it("refetches after archiving a collection", async () => {
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

      await waitFor(async () => {
        expect(await countBookmarkRequests()).toBe(2);
      });
    });
  });
});
