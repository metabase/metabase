import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { findRequests } from "__support__/server-mocks";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockCollectionItemFromCollection,
} from "metabase-types/api/mocks";

import { Api } from "./api";
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
  fetchMock.get("path:/api/collection/root/items", {
    data: [
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
    models: ["collection", "card"],
    total: 2,
    limit: null,
    offset: null,
  });

  fetchMock.put(`path:/api/collection/${CHILD_COLLECTION_ID}`, () =>
    createMockCollection({
      id: CHILD_COLLECTION_ID,
      name: "My collection",
      archived: true,
    }),
  );

  fetchMock.put(`path:/api/card/${CHILD_CARD_ID}`, () =>
    createMockCollectionItem({
      id: CHILD_CARD_ID,
      model: "card",
      name: "My question",
      archived: true,
    }),
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
