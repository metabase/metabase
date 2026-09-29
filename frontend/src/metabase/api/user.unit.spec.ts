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
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  // The admin people list works out each user's role from the permissions groups query.
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
