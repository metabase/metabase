import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { createMockQueryAction } from "metabase-types/api/mocks";

import { actionApi } from "./action";
import { Api } from "./api";

const ACTION = createMockQueryAction({ id: 1, name: "Old name" });

let activeStore: ReturnType<typeof getStore> | undefined;

async function setup() {
  fetchMock.get(`path:/api/action/${ACTION.id}`, ACTION);

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;

  const getCachedAction = () =>
    actionApi.endpoints.getAction.select({ id: ACTION.id })(store.getState())
      .data;

  store.dispatch(actionApi.endpoints.getAction.initiate({ id: ACTION.id }));
  await waitFor(() => expect(getCachedAction()).toBeDefined());

  return { store, getCachedAction };
}

describe("actionApi cache updates", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  it("should apply an update to the cached action before the request finishes", async () => {
    const { store, getCachedAction } = await setup();
    fetchMock.put(`path:/api/action/${ACTION.id}`, new Promise(() => {}));

    store.dispatch(
      actionApi.endpoints.updateAction.initiate({
        id: ACTION.id,
        name: "New name",
      }),
    );

    await waitFor(() => expect(getCachedAction()?.name).toBe("New name"));
  });

  it("should revert the cached action when the update fails", async () => {
    const { store, getCachedAction } = await setup();
    fetchMock.put(`path:/api/action/${ACTION.id}`, 500);

    await store.dispatch(
      actionApi.endpoints.updateAction.initiate({
        id: ACTION.id,
        name: "New name",
      }),
    );

    expect(getCachedAction()?.name).toBe("Old name");
  });
});
