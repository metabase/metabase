import { configureStore } from "@reduxjs/toolkit";

import { setupDashboardsEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import {
  createMockDashboard,
  createMockDatabase,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createMockDashboardState } from "metabase-types/store/mocks";

import { dashboardReducers } from "../reducers";

import { fetchDashboard } from "./data-fetching-typed";

function setup({ dashboards = [] }) {
  const state = {
    dashboard: createMockDashboardState(),
    entities: createMockEntitiesState({
      databases: [createMockDatabase()],
    }),
    settings: createMockSettings(),
  };

  const store = configureStore({
    reducer: {
      dashboard: dashboardReducers,
      entities: (state = {}) => state,
      settings: (state = {}) => state,
    },
    preloadedState: state,
  });

  setupDashboardsEndpoints(dashboards);

  return store;
}

describe("fetchDashboard", () => {
  it("should cancel previous dashboard fetch when a new one is initiated (metabase#35959)", async () => {
    const store = setup({
      dashboards: [
        createMockDashboard({ id: 1 }),
        createMockDashboard({ id: 2 }),
      ],
    });

    const firstFetch = store.dispatch(
      fetchDashboard({
        dashId: 1,
        queryParams: {},
        options: {},
      }),
    );

    const secondFetch = store.dispatch(
      fetchDashboard({
        dashId: 2,
        queryParams: {},
        options: {},
      }),
    );

    await expect(firstFetch).resolves.toHaveProperty(
      "type",
      "metabase/dashboard/FETCH_DASHBOARD/rejected",
    );

    await expect(secondFetch).resolves.toMatchObject({
      type: "metabase/dashboard/FETCH_DASHBOARD/fulfilled",
      payload: {
        dashboardId: 2,
        dashboard: {
          id: 2,
        },
      },
    });
  });
});
