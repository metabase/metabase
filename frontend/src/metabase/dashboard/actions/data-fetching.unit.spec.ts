import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import {
  setupDashboardQueryMetadataEndpoint,
  setupDashboardsEndpoints,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { Api } from "metabase/api";
import { isQuestionDashCard } from "metabase/utils/dashboard";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import type { DashboardState, State } from "metabase-types/store";
import {
  createMockDashboardState,
  createMockSettingsState,
  createMockStoreDashboard,
} from "metabase-types/store/mocks";

import { dashboardReducers } from "../reducers";

import {
  fetchCardDataAction,
  fetchDashboard,
  fetchDashboardCardData,
  reloadDashboardCards,
} from "./data-fetching";

type SetupOpts = {
  dashboards?: Dashboard[];
  dashboard?: DashboardState;
};

function setup({
  dashboards = [],
  dashboard = createMockDashboardState(),
}: SetupOpts = {}) {
  const database = createSampleDatabase();
  const state = {
    dashboard,
    entities: createMockEntitiesState({
      databases: [database],
    }),
    settings: createMockSettingsState(),
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
  dashboards.forEach((dashboard) => {
    setupDashboardQueryMetadataEndpoint(
      dashboard,
      createMockDashboardQueryMetadata({ databases: [database] }),
    );
  });

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

    const sleep = (delay: number) =>
      new Promise<void>((res) => setTimeout(res, delay));

    const DASHBOARD = createMockDashboard({
      id: 1,
      dashcards: [createMockDashboardCard()],
    });
    const dashcard = DASHBOARD.dashcards[0];
    if (!isQuestionDashCard(dashcard)) {
      throw new Error("Expected question dashcard");
    }

    const store = setup({
      dashboards: [DASHBOARD],
      dashboard: createMockDashboardState({
        dashboardId: DASHBOARD.id,
        dashboards: {
          [DASHBOARD.id]: createMockStoreDashboard({
            ...DASHBOARD,
            dashcards: DASHBOARD.dashcards.map((dashcard) => dashcard.id),
          }),
        },
      }),
    });

    const firstFetch = store.dispatch(
      fetchCardDataAction({
        card: dashcard.card,
        dashcard,
        options: {},
      }),
    );

    await sleep(50);

    const secondFetch = store.dispatch(
      fetchCardDataAction({
        card: dashcard.card,
        dashcard,
        options: {},
      }),
    );
    await sleep(50);

    const thirdFetch = store.dispatch(
      fetchCardDataAction({
        card: dashcard.card,
        dashcard,
        options: {},
      }),
    );

    const firstResult = await firstFetch;
    const secondResult = await secondFetch;
    const thirdResult = await thirdFetch;

    expect(firstResult.payload).toMatchObject({ result: null });
    expect(secondResult.payload).toMatchObject({ result: null });
    expect(thirdResult.payload).toMatchObject({ result: { foo: true } });
  });
});

/**
 * Creates a mock dispatch/getState pair that executes thunks but skips the
 * Redux store, avoiding the Immer/icepick incompatibility in dashcardData
 * reducer when multiple fulfilled actions arrive.
 */
function createMockDispatch(getState: () => Partial<State>) {
  const dispatch = (action: unknown): unknown => {
    if (typeof action === "function") {
      return action(dispatch, getState);
    }
    return Promise.resolve(action);
  };
  return dispatch;
}

function setupConcurrencyTest(dashboardId: number, cardCount: number) {
  let currentConcurrent = 0;
  let maxConcurrent = 0;

  const database = createSampleDatabase();
  const dashcards = Array.from({ length: cardCount }, (_, i) =>
    createMockDashboardCard({
      id: i + 1,
      card_id: i + 1,
      dashboard_id: dashboardId,
      card: createMockCard({ id: i + 1 }),
    }),
  );

  dashcards.forEach((dashcard) => {
    fetchMock.post(
      `/api/dashboard/${dashboardId}/dashcard/${dashcard.id}/card/${dashcard.card_id}/query`,
      () =>
        new Promise((resolve) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          setTimeout(() => {
            currentConcurrent--;
            resolve({ data: [] });
          }, 50);
        }),
    );
  });

  const DASHBOARD = createMockDashboard({ id: dashboardId, dashcards });
  const state: Partial<State> = {
    dashboard: createMockDashboardState({
      dashboardId: DASHBOARD.id,
      dashboards: {
        [DASHBOARD.id]: createMockStoreDashboard({
          ...DASHBOARD,
          dashcards: dashcards.map((dc) => dc.id),
        }),
      },
      dashcards: Object.fromEntries(dashcards.map((dc) => [dc.id, dc])),
    }),
    entities: createMockEntitiesState({ databases: [database] }),
    settings: createMockSettingsState(),
  };

  const getState = () => state;
  const dispatch = createMockDispatch(getState);

  return { dispatch, getState, getMaxConcurrent: () => maxConcurrent };
}

describe("fetchDashboardCardData", () => {
  it("should make at most 5 api calls simultaneously", async () => {
    const { dispatch, getState, getMaxConcurrent } = setupConcurrencyTest(
      100,
      8,
    );

    await fetchDashboardCardData()(dispatch as never, getState as never);

    expect(getMaxConcurrent()).toBe(5);
  });
});

describe("reloadDashboardCards", () => {
  it("should make at most 5 api calls simultaneously", async () => {
    const { dispatch, getState, getMaxConcurrent } = setupConcurrencyTest(
      200,
      8,
    );

    await reloadDashboardCards()(dispatch as never, getState as never);

    expect(getMaxConcurrent()).toBe(5);
  });
});
