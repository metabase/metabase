import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { findRequests } from "__support__/server-mocks";

import { Api } from "./api";
import { setupApi } from "./setup";

let activeStore: ReturnType<typeof getStore> | undefined;

function setup() {
  fetchMock.post("path:/api/setup", 200);

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;

  return { store };
}

describe("setupApi", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  it("creates the first user during setup", async () => {
    const { store } = setup();

    const body = {
      token: "123456",
      user: {
        email: "first@metabase.test",
        password: "metasample123",
        first_name: "First",
        last_name: "User",
      },
      prefs: {
        site_name: "Metabase",
        site_locale: "en",
      },
    };

    await store.dispatch(setupApi.endpoints.createSetup.initiate(body));

    await waitFor(async () => {
      const posts = await findRequests("POST");
      expect(posts).toHaveLength(1);
    });

    const [request] = await findRequests("POST");
    expect(request.url).toContain("/api/setup");
    expect(request.body).toEqual(body);
  });
});
