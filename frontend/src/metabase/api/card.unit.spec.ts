import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import type { Card } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { Api } from "./api";
import { cardApi } from "./card";

const OLD_CARD = createMockCard({ id: 1, name: "Before the save" });
const SAVED_CARD = createMockCard({
  id: 1,
  name: "After the save",
  enable_embedding: true,
});

type Store = ReturnType<typeof getStore>;

let activeStore: Store | undefined;

describe("cardApi cache updates", () => {
  afterEach(() => {
    // Aborts the running query before its fetch route is removed.
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
  });

  it.each([
    {
      name: "updateCard",
      save: (store: Store) =>
        store.dispatch(
          cardApi.endpoints.updateCard.initiate({
            id: OLD_CARD.id,
            name: SAVED_CARD.name,
          }),
        ),
    },
    {
      name: "updateCardEnableEmbedding",
      save: (store: Store) =>
        store.dispatch(
          cardApi.endpoints.updateCardEnableEmbedding.initiate({
            id: OLD_CARD.id,
            enable_embedding: true,
            embedding_type: "static-legacy",
          }),
        ),
    },
  ])(
    "should cache the saved card after $name while a query is running",
    async ({ save }) => {
      const { store, getCachedCard } = await setup();

      await save(store);

      await waitFor(() => expect(getCachedCard()).toEqual(SAVED_CARD));
    },
  );
});

async function setup() {
  let serverCard: Card = OLD_CARD;
  fetchMock.get(`path:/api/card/${OLD_CARD.id}`, () => serverCard);
  fetchMock.put(`path:/api/card/${OLD_CARD.id}`, () => {
    serverCard = SAVED_CARD;
    return serverCard;
  });
  fetchMock.post(`path:/api/card/${OLD_CARD.id}/query`, new Promise(() => {}));

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;

  const getCachedCard = () =>
    cardApi.endpoints.getCard.select({ id: OLD_CARD.id })(store.getState())
      .data;

  store.dispatch(cardApi.endpoints.getCard.initiate({ id: OLD_CARD.id }));
  await waitFor(() => expect(getCachedCard()).toEqual(OLD_CARD));

  // A running query holds back the save's tag invalidation, as a slow
  // question does in the query builder.
  store.dispatch(
    cardApi.endpoints.getCardQuery.initiate({ cardId: OLD_CARD.id }),
  );

  return { store, getCachedCard };
}
