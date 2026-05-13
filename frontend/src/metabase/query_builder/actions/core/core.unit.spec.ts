import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { Api } from "metabase/api";
import { undoReducer } from "metabase/redux/undo";
import { createMockRevision } from "metabase-types/api/mocks/revision";

import { revertToRevision } from "./core";

function setup() {
  const store = getStore(
    {
      [Api.reducerPath]: Api.reducer,
      undo: undoReducer,
    },
    { undo: [] },
    [Api.middleware],
  );

  return store;
}

describe("card revertToRevision", () => {
  it("dispatches an error toast with the backend-provided message when the revert fails", async () => {
    const cardId = 1;
    const revision = createMockRevision({ id: 42 });

    fetchMock.post("path:/api/revision/revert", {
      status: 500,
      body: { message: "Cannot revert: missing card" },
    });

    const store = setup();

    await expect(
      store.dispatch(revertToRevision(cardId, revision)),
    ).rejects.toBeDefined();

    const undos = store.getState().undo;
    expect(undos).toHaveLength(1);
    expect(undos[0]).toMatchObject({
      toastColor: "error",
      icon: "warning",
      message: "Cannot revert: missing card",
    });
  });

  it("falls back to a generic error message when the backend does not provide one", async () => {
    const cardId = 1;
    const revision = createMockRevision({ id: 42 });

    fetchMock.post("path:/api/revision/revert", {
      status: 500,
      body: {},
    });

    const store = setup();

    await expect(
      store.dispatch(revertToRevision(cardId, revision)),
    ).rejects.toBeDefined();

    const undos = store.getState().undo;
    expect(undos).toHaveLength(1);
    expect(undos[0]).toMatchObject({
      toastColor: "error",
      icon: "warning",
      message: "Failed to revert to previous version.",
    });
  });
});
