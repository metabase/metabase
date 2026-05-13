import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { createMockEntitiesState } from "__support__/store";
import { Api } from "metabase/api";
import {
  createMockDashboardState,
  createMockSettingsState,
} from "metabase/redux/store/mocks";
import { undoReducer } from "metabase/redux/undo";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockRevision } from "metabase-types/api/mocks/revision";

import { dashboardReducers } from "../reducers";

import { revertToRevision } from "./revisions";

function setup() {
  const database = createSampleDatabase();
  const state = {
    dashboard: createMockDashboardState(),
    entities: createMockEntitiesState({ databases: [database] }),
    settings: createMockSettingsState(),
    undo: [],
  };

  const store = getStore(
    {
      [Api.reducerPath]: Api.reducer,
      dashboard: dashboardReducers,
      entities: (state = {}) => state,
      settings: (state = {}) => state,
      undo: undoReducer,
    },
    state,
    [Api.middleware],
  );

  return store;
}

describe("dashboard revertToRevision", () => {
  it("dispatches an error toast with the backend-provided message when the revert fails", async () => {
    const dashboardId = 1;
    const revision = createMockRevision({ id: 42 });

    fetchMock.post("path:/api/revision/revert", {
      status: 500,
      body: { message: "Cannot revert: missing card" },
    });

    const store = setup();

    await expect(
      store.dispatch(revertToRevision(dashboardId, revision)),
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
    const dashboardId = 1;
    const revision = createMockRevision({ id: 42 });

    fetchMock.post("path:/api/revision/revert", {
      status: 500,
      body: {},
    });

    const store = setup();

    await expect(
      store.dispatch(revertToRevision(dashboardId, revision)),
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
