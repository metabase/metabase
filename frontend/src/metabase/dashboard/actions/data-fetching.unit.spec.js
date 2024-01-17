import { configureStore } from "@reduxjs/toolkit";
import { setupDashboardEndpoints } from "__support__/server-mocks";
import {
  createMockDashboard,
  createMockDatabase,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createMockDashboardState } from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import { dashboardReducers } from "../reducers";
import { fetchDashboard } from "./data-fetching";

describe("fetchDashboard", () => {
  let store;

  beforeEach(() => {
    const state = {
      dashboard: createMockDashboardState(),
      entities: createMockEntitiesState({
        databases: [createMockDatabase()],
      }),
      settings: createMockSettings(),
    };

    store = configureStore({
      reducer: {
        dashboard: dashboardReducers,
        entities: (state = {}) => state,
        settings: (state = {}) => state,
      },
      preloadedState: state,
    });

    setupDashboardEndpoints(createMockDashboard({ id: 1 }));
    setupDashboardEndpoints(createMockDashboard({ id: 2 }));
  });

  it("should cancel previous dashboard fetch when a new one is initiated (metabase#35959)", async () => {
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
