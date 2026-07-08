import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { findRequests } from "__support__/server-mocks";

import { Api } from "./api";
import { persistApi } from "./persist";

let activeStore: ReturnType<typeof getStore> | undefined;

function setup() {
  fetchMock.post("path:/api/persist/enable", 204);
  fetchMock.post("path:/api/persist/disable", 204);
  fetchMock.post("path:/api/persist/set-refresh-schedule", 204);

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;

  return { store };
}

describe("persistApi", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  it("enables persistence", async () => {
    const { store } = setup();

    await store.dispatch(persistApi.endpoints.enablePersist.initiate());

    await waitFor(async () => {
      const posts = await findRequests("POST");
      expect(posts).toHaveLength(1);
    });
    const [request] = await findRequests("POST");
    expect(request.url).toContain("/api/persist/enable");
  });

  it("disables persistence", async () => {
    const { store } = setup();

    await store.dispatch(persistApi.endpoints.disablePersist.initiate());

    await waitFor(async () => {
      const posts = await findRequests("POST");
      expect(posts).toHaveLength(1);
    });
    const [request] = await findRequests("POST");
    expect(request.url).toContain("/api/persist/disable");
  });

  it("sets the refresh schedule", async () => {
    const { store } = setup();

    await store.dispatch(
      persistApi.endpoints.setRefreshSchedule.initiate({
        cron: "0 0 0/6 * * ? *",
      }),
    );

    await waitFor(async () => {
      const posts = await findRequests("POST");
      expect(posts).toHaveLength(1);
    });
    const [request] = await findRequests("POST");
    expect(request.url).toContain("/api/persist/set-refresh-schedule");
    expect(request.body).toEqual({ cron: "0 0 0/6 * * ? *" });
  });
});
