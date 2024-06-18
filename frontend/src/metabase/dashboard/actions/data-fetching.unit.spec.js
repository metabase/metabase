import { getStore } from "__support__/entities-store";
import {
  setupDashboardQueryMetadataEndpoint,
  setupDashboardsEndpoints,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { Api } from "metabase/api";
import {
  createMockDashboard,
  createMockDashboardQueryMetadata,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockDashboardState } from "metabase-types/store/mocks";

import { dashboardReducers } from "../reducers";

import { fetchDashboard } from "./data-fetching-typed";

function setup({ dashboards = [] }) {
  const database = createSampleDatabase();
  const state = {
    dashboard: createMockDashboardState(),
    entities: createMockEntitiesState({
      databases: [database],
    }),
    settings: createMockSettings(),
  };

  const store = getStore(
    {
      [Api.reducerPath]: Api.reducer,
      dashboard: dashboardReducers,
      entities: (state = {}) => state,
      settings: (state = {}) => state,
    },
    state,
    [Api.middleware],
  );

  setupDatabaseEndpoints(database);
  setupDashboardsEndpoints(dashboards);
  dashboards.forEach(dashboard =>
    setupDashboardQueryMetadataEndpoint(
      dashboard,
      createMockDashboardQueryMetadata({ databases: [database] }),
    ),
  );

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
