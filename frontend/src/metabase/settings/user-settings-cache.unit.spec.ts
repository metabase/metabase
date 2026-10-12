import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { waitFor } from "__support__/ui";
import { Api, userApi } from "metabase/api";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";

import { settingsApi } from "./api";
import { getSetting } from "./selectors";

type TestStore = ReturnType<typeof getStore>;

let activeStore: TestStore | undefined;

async function setup(activeUsersCount: number) {
  setupPropertiesEndpoints(
    createMockSettings({ "active-users-count": activeUsersCount }),
  );

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;

  await store.dispatch(settingsApi.endpoints.getSessionProperties.initiate());

  return {
    store,
    getActiveUsersCount: () =>
      getSetting(store.getState(), "active-users-count"),
  };
}

const USER = createMockUser({ id: 2 });

describe("user settings cache", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
  });

  describe.each([
    {
      action: "creating a user",
      method: "POST",
      url: "/api/user",
      initialCount: 1,
      updatedCount: 2,
      mutate: (store: TestStore) =>
        store.dispatch(
          userApi.endpoints.createUser.initiate({ email: USER.email }),
        ),
    },
    {
      action: "deactivating a user",
      method: "DELETE",
      url: `/api/user/${USER.id}`,
      initialCount: 2,
      updatedCount: 1,
      mutate: (store: TestStore) =>
        store.dispatch(userApi.endpoints.deactivateUser.initiate(USER.id)),
    },
    {
      action: "reactivating a user",
      method: "PUT",
      url: `/api/user/${USER.id}/reactivate`,
      initialCount: 1,
      updatedCount: 2,
      mutate: (store: TestStore) =>
        store.dispatch(userApi.endpoints.reactivateUser.initiate(USER.id)),
    },
  ])("$action", ({ method, url, initialCount, updatedCount, mutate }) => {
    it("refreshes the active user count after success (#83316)", async () => {
      const { store, getActiveUsersCount } = await setup(initialCount);
      expect(getActiveUsersCount()).toBe(initialCount);

      setupPropertiesEndpoints(
        createMockSettings({ "active-users-count": updatedCount }),
      );
      fetchMock.route(`path:${url}`, USER, { method });

      await mutate(store);

      await waitFor(() => {
        expect(getActiveUsersCount()).toBe(updatedCount);
      });
    });

    it("preserves the active user count after failure (#83316)", async () => {
      const { store, getActiveUsersCount } = await setup(initialCount);
      fetchMock.route(`path:${url}`, 500, { method });

      const result = await mutate(store);

      expect(result.error).toBeDefined();
      expect(getActiveUsersCount()).toBe(initialCount);
      expect(
        fetchMock.callHistory.calls("path:/api/session/properties"),
      ).toHaveLength(1);
    });
  });
});
