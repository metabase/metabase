import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { findRequests } from "__support__/server-mocks";

import { Api } from "./api";
import { frontendErrorsApi } from "./frontend-errors";

let activeStore: ReturnType<typeof getStore> | undefined;

function setup() {
  fetchMock.post("path:/api/frontend-errors", 204);

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;

  return { store };
}

describe("frontendErrorsApi", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  it("reports a frontend error type to the backend", async () => {
    const { store } = setup();

    await store.dispatch(
      frontendErrorsApi.endpoints.reportFrontendError.initiate({
        type: "component-crash",
      }),
    );

    await waitFor(async () => {
      const posts = await findRequests("POST");
      expect(posts).toHaveLength(1);
    });

    const [{ url, body }] = await findRequests("POST");
    expect(url).toContain("/api/frontend-errors");
    expect(body).toEqual({ type: "component-crash" });
  });
});
