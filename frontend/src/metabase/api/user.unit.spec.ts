import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { findRequests } from "__support__/server-mocks";
import { createMockGroup, createMockUser } from "metabase-types/api/mocks";

import { Api } from "./api";
import { permissionApi } from "./permission";
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

  // Regression metabase#60241: creating a user with an admin group did not show
  // the Admin role until a manual refresh. The people list derives roles from
  // the permissions-group memberships, so createUser must invalidate the
  // permissions-group LIST tag that listPermissionsGroups provides. If that
  // wiring breaks, a still-subscribed groups query keeps serving stale data.
  describe("createUser cache invalidation (metabase#60241)", () => {
    async function countGroupsRequests() {
      const gets = await findRequests("GET");
      return gets.filter((request) =>
        request.url.includes("/api/permissions/group"),
      ).length;
    }

    it("refetches the permissions-group list after creating a user", async () => {
      fetchMock.get("path:/api/permissions/group", [
        createMockGroup({ id: 2, name: "Administrators" }),
      ]);
      fetchMock.post("path:/api/user", createMockUser({ id: 42 }));

      const { store } = setup();

      // Keep an active subscription, as the admin people page would.
      store.dispatch(
        permissionApi.endpoints.listPermissionsGroups.initiate(undefined),
      );
      await waitFor(async () => {
        expect(await countGroupsRequests()).toBe(1);
      });

      await store.dispatch(
        userApi.endpoints.createUser.initiate({
          first_name: "Ada",
          last_name: "Lovelace",
          email: "ada@example.com",
          user_group_memberships: [{ id: 2, is_group_manager: false }],
        }),
      );

      await waitFor(async () => {
        expect(await countGroupsRequests()).toBe(2);
      });
    });
  });
});
