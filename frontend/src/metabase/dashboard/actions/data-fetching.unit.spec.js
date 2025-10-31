import fetchMock from "fetch-mock";

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
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockDashboardState } from "metabase-types/store/mocks";

import { dashboardReducers } from "../reducers";

import { fetchCardDataAction, fetchDashboard } from "./data-fetching";

function setup({ dashboards = [], dashboard = createMockDashboardState() }) {
  const database = createSampleDatabase();
  const state = {
    dashboard,
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
  dashboards.forEach((dashboard) =>
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

  it("should not clear a defer for a cancelled request", async () => {
    fetchMock.post("/api/dashboard/1/dashcard/1/card/1/query", () => {
      return new Promise((res) => {
        setTimeout(() => {
          res({ foo: true });
        }, 300);
      });
    });

    const sleep = (delay) => new Promise((res) => setTimeout(res, delay));

    const DASHBOARD = createMockDashboard({
      id: 1,
      dashcards: [createMockDashboardCard()],
    });

    const store = setup({
      dashboards: [DASHBOARD],
      dashboard: createMockDashboardState({
        dashboardId: DASHBOARD.id,
        dashboards: {
          [DASHBOARD.id]: DASHBOARD,
        },
      }),
    });

    const firstFetch = store.dispatch(
      fetchCardDataAction({
        card: DASHBOARD.dashcards[0].card,
        dashcard: DASHBOARD.dashcards[0],
      }),
    );

    await sleep(50);

    const secondFetch = store.dispatch(
      fetchCardDataAction({
        card: DASHBOARD.dashcards[0].card,
        dashcard: DASHBOARD.dashcards[0],
      }),
    );
    await sleep(50);

    const thirdFetch = store.dispatch(
      fetchCardDataAction({
        card: DASHBOARD.dashcards[0].card,
        dashcard: DASHBOARD.dashcards[0],
      }),
    );

    const firstResult = (await firstFetch).payload;
    const secondResult = (await secondFetch).payload;
    const thirdResult = (await thirdFetch).payload;

    expect(firstResult.result).toBe(null);
    expect(secondResult.result).toBe(null);
    expect(thirdResult.result).toHaveProperty("foo", true);
  });
});
