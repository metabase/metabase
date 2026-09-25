import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { Api } from "metabase/api/api";
import { currentUserApi } from "metabase/current-user";
import { createMockUser } from "metabase-types/api/mocks";

import { appReducer, getAdminPaths } from "./reducers";

describe("getAdminPaths", () => {
  // The order is load-bearing: AdminNavbar binds the digits 1-9 to
  // `adminPaths[key - 1]`, so inserting or reordering an entry silently
  // re-points a keyboard shortcut at a different page.
  it("keeps the tab order the digit shortcuts are bound to", () => {
    expect(getAdminPaths().map(({ key }) => key)).toEqual([
      "settings",
      "databases",
      "embedding",
      "metabot",
      "data-model",
      "people",
      "permissions",
      "performance",
      "help",
    ]);
  });
});

describe("admin paths reducer", () => {
  const setup = async ({ isAdmin }: { isAdmin: boolean }) => {
    fetchMock.get(
      "path:/api/user/current",
      createMockUser({ is_superuser: isAdmin }),
    );
    const store = getStore(
      { [Api.reducerPath]: Api.reducer, app: appReducer },
      {},
      [Api.middleware],
    );

    const initialKeys = store.getState().app.paths.map(({ key }) => key);
    await store.dispatch(currentUserApi.endpoints.getCurrentUser.initiate());
    const keys = store.getState().app.paths.map(({ key }) => key);

    store.dispatch(Api.util.resetApiState());
    return { initialKeys, keys };
  };

  it("keeps every admin path for an admin", async () => {
    const { initialKeys, keys } = await setup({ isAdmin: true });

    expect(keys).toEqual(initialKeys);
  });

  it("drops every admin path for a non-admin without extra permissions", async () => {
    const { initialKeys, keys } = await setup({ isAdmin: false });

    expect(initialKeys).toContain("settings");
    expect(keys).toEqual([]);
  });
});
