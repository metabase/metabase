import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { findRequests } from "__support__/server-mocks";
import { createMockDatabase } from "metabase-types/api/mocks";

import { Api } from "./api";
import { databaseApi } from "./database";

let activeStore: ReturnType<typeof getStore> | undefined;

const DATABASE_ID = 1;

/**
 * The admin "Model persistence" toggle reflects the database's persisted
 * state, which it reads from the cached database entity. Regression
 * metabase#26470: after enabling/disabling model caching the toggle stayed
 * stuck on its old value because nothing refreshed the database. The refresh
 * is guaranteed by RTK-Query cache-tag wiring: `getDatabase` `providesTags`
 * the database `idTag`, and `persistDatabase` / `unpersistDatabase`
 * `invalidatesTags` that same tag. If either side of that wiring breaks, the
 * still-subscribed database query never refetches and the toggle goes stale.
 */
function setup() {
  fetchMock.get(`path:/api/database/${DATABASE_ID}`, () =>
    createMockDatabase({ id: DATABASE_ID }),
  );
  fetchMock.post(`path:/api/persist/database/${DATABASE_ID}/persist`, 204);
  fetchMock.post(`path:/api/persist/database/${DATABASE_ID}/unpersist`, 204);

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;

  return { store };
}

async function countDatabaseRequests() {
  const gets = await findRequests("GET");
  return gets.filter((request) =>
    request.url.includes(`/api/database/${DATABASE_ID}`),
  ).length;
}

describe("databaseApi model persistence cache invalidation (metabase#26470)", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  it("refetches the database after enabling model persistence", async () => {
    const { store } = setup();

    // Keep an active subscription, as the open admin section would.
    store.dispatch(
      databaseApi.endpoints.getDatabase.initiate({ id: DATABASE_ID }),
    );
    await waitFor(async () => {
      expect(await countDatabaseRequests()).toBe(1);
    });

    await store.dispatch(
      databaseApi.endpoints.persistDatabase.initiate(DATABASE_ID),
    );

    // Persisting invalidates the database idTag the query provides, so the
    // still-subscribed database query refetches and the toggle can update.
    await waitFor(async () => {
      expect(await countDatabaseRequests()).toBe(2);
    });
  });

  it("refetches the database after disabling model persistence", async () => {
    const { store } = setup();

    store.dispatch(
      databaseApi.endpoints.getDatabase.initiate({ id: DATABASE_ID }),
    );
    await waitFor(async () => {
      expect(await countDatabaseRequests()).toBe(1);
    });

    await store.dispatch(
      databaseApi.endpoints.unpersistDatabase.initiate(DATABASE_ID),
    );

    await waitFor(async () => {
      expect(await countDatabaseRequests()).toBe(2);
    });
  });
});
