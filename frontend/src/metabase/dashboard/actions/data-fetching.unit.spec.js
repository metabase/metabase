import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import {
  setupDashboardsEndpoints,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { Api } from "metabase/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardTab,
  createMockSettings,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";
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

  return store;
}

describe("fetchDashboard", () => {
  it("should fetch metadata for all cards when there are no tabs", async () => {
    const dashboard = createMockDashboard({
      dashcards: [
        createMockDashboardCard({
          card: createMockCard({
            dataset_query: createMockStructuredDatasetQuery({
              query: {
                "source-table": PRODUCTS_ID,
              },
            }),
          }),
        }),
        createMockDashboardCard({
          card: createMockCard({
            dataset_query: createMockStructuredDatasetQuery({
              query: {
                "source-table": ORDERS_ID,
              },
            }),
          }),
        }),
      ],
    });
    const store = setup({
      dashboards: [dashboard],
    });

    await store.dispatch(
      fetchDashboard({
        dashId: dashboard.id,
        queryParams: {},
        options: {},
      }),
    );

    expect(
      fetchMock.calls(`path:/api/table/${PRODUCTS_ID}/query_metadata`),
    ).toHaveLength(1);
    expect(
      fetchMock.calls(`path:/api/table/${ORDERS_ID}/query_metadata`),
    ).toHaveLength(1);
  });

  it("should fetch metadata for cards on the first tab when there are tabs", async () => {
    const dashboard = createMockDashboard({
      dashcards: [
        createMockDashboardCard({
          card: createMockCard({
            dataset_query: createMockStructuredDatasetQuery({
              query: {
                "source-table": PRODUCTS_ID,
              },
            }),
          }),
          dashboard_tab_id: 1,
        }),
        createMockDashboardCard({
          card: createMockCard({
            dataset_query: createMockStructuredDatasetQuery({
              query: {
                "source-table": ORDERS_ID,
              },
            }),
          }),
          dashboard_tab_id: 2,
        }),
      ],
      tabs: [
        createMockDashboardTab({
          id: 1,
        }),
        createMockDashboardTab({
          id: 2,
        }),
      ],
    });
    const store = setup({
      dashboards: [dashboard],
    });

    await store.dispatch(
      fetchDashboard({
        dashId: dashboard.id,
        queryParams: {},
        options: {},
      }),
    );

    expect(
      fetchMock.calls(`path:/api/table/${PRODUCTS_ID}/query_metadata`),
    ).toHaveLength(1);
    expect(
      fetchMock.calls(`path:/api/table/${ORDERS_ID}/query_metadata`),
    ).toHaveLength(0);
  });

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
