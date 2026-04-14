import { combineReducers, configureStore } from "@reduxjs/toolkit";
import fetchMock from "fetch-mock";

import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { Api } from "metabase/api";
import { sessionApi } from "metabase/api/session";
import { createMockSettings } from "metabase-types/api/mocks";

import { sessionListenerMiddleware } from "./session-listener-middleware";
import { settings } from "./settings";

const createTestStore = () => {
  return configureStore({
    reducer: combineReducers({
      settings,
      [Api.reducerPath]: Api.reducer,
    }),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        immutableCheck: false,
        serializableCheck: false,
      })
        .concat(Api.middleware)
        .concat(sessionListenerMiddleware.middleware as any),
  });
};

describe("session-listener-middleware", () => {
  afterEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("should hydrate settings state after getSessionProperties succeeds", async () => {
    const mockSettings = createMockSettings({ "site-name": "Metabased" });
    setupPropertiesEndpoints(mockSettings);

    const store = createTestStore();
    await store
      .dispatch(sessionApi.endpoints.getSessionProperties.initiate())
      .unwrap();

    expect(store.getState().settings.values["site-name"]).toBe("Metabased");
    expect(store.getState().settings.loading).toBe(false);
  });
});
