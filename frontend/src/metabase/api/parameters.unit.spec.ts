import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { findRequests } from "__support__/server-mocks";
import {
  createMockParameter,
  createMockParameterValues,
} from "metabase-types/api/mocks";

import { Api } from "./api";
import { parametersApi } from "./parameters";

let activeStore: ReturnType<typeof getStore> | undefined;

function setup() {
  fetchMock.post(
    "path:/api/dataset/parameter/values",
    createMockParameterValues(),
  );
  fetchMock.post(
    "express:/api/dataset/parameter/search/:query",
    createMockParameterValues(),
  );

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;

  return { store };
}

describe("parametersApi", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  it("sends the parameter and fields as a POST body when fetching values", async () => {
    const { store } = setup();
    const parameter = createMockParameter({ id: "abc" });

    await store.dispatch(
      parametersApi.endpoints.getParameterValues.initiate({
        parameter,
        field_ids: [1, 2],
      }),
    );

    await waitFor(async () => {
      expect(await findRequests("POST")).toHaveLength(1);
    });

    const [{ url, body }] = await findRequests("POST");
    expect(url).toContain("/api/dataset/parameter/values");
    expect(body).toEqual({ parameter, field_ids: [1, 2] });
  });

  it("puts the query in the URL and the rest in the body when searching values", async () => {
    const { store } = setup();
    const parameter = createMockParameter({ id: "abc" });

    await store.dispatch(
      parametersApi.endpoints.searchParameterValues.initiate({
        parameter,
        field_ids: [1, 2],
        query: "foo bar",
      }),
    );

    await waitFor(async () => {
      expect(await findRequests("POST")).toHaveLength(1);
    });

    const [{ url, body }] = await findRequests("POST");
    expect(url).toContain("/api/dataset/parameter/search/foo%20bar");
    expect(body).toEqual({ parameter, field_ids: [1, 2] });
  });
});
