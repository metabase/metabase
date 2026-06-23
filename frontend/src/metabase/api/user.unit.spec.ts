import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { findRequests } from "__support__/server-mocks";
import { createMockUser } from "metabase-types/api/mocks";

import { Api } from "./api";
import { userApi } from "./user";

let activeStore: ReturnType<typeof getStore> | undefined;

function setup() {
  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;
  return { store };
}

describe("userApi", () => {
  afterEach(() => {
    // Drop the store's RTK Query subscriptions before pulling the fetch routes,
    // otherwise orphaned subscriptions refetch against removed routes.
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  describe("getCurrentUser", () => {
    it("fetches the current user", async () => {
      const user = createMockUser({ id: 7 });
      fetchMock.get("path:/api/user/current", user);

      const { store } = setup();

      const { data } = await store.dispatch(
        userApi.endpoints.getCurrentUser.initiate(),
      );

      expect(data?.id).toBe(7);

      const [request] = await findRequests("GET");
      expect(request.url).toContain("/api/user/current");
    });
  });

  describe("updateUserModalQbnewb", () => {
    it("marks the qbnewb modal as seen for the given user", async () => {
      fetchMock.put("path:/api/user/7/modal/qbnewb", 204);

      const { store } = setup();

      await store.dispatch(userApi.endpoints.updateUserModalQbnewb.initiate(7));

      await waitFor(async () => {
        const puts = await findRequests("PUT");
        expect(puts).toHaveLength(1);
      });

      const [request] = await findRequests("PUT");
      expect(request.url).toContain("/api/user/7/modal/qbnewb");
    });
  });
});
