import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import {
  setupDashboardQueryMetadataEndpoint,
  setupDashboardsEndpoints,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import { setupDashboardCardQueryBatchEndpoint } from "__support__/server-mocks/dashcard";
import { createMockEntitiesState } from "__support__/store";
import { Api } from "metabase/api";
import type { DashboardState, State } from "metabase/redux/store";
import {
  createMockDashboardState,
  createMockSettingsState,
  createMockStoreDashboard,
} from "metabase/redux/store/mocks";
import { isQuestionDashCard } from "metabase/utils/dashboard";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDashboardTab,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

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

  it("should not cancel an in-flight request when re-dispatched with the same parameters (#70534)", async () => {
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

    // Same card, same params: should return early (no cancel, no restart)
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

    // The first fetch completes normally (never cancelled)
    expect(firstResult.payload).toMatchObject({ result: { foo: true } });
    // The second and third fetches returned early because the first was
    // already in-flight with matching parameters
    expect(secondResult.payload).toBeUndefined();
    expect(thirdResult.payload).toBeUndefined();
  });

  it("should cancel an in-flight request when re-dispatched with different parameters", async () => {
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
      parameters: [{ id: "param1", name: "P1", slug: "p1", type: "id" }],
      dashcards: [
        createMockDashboardCard({
          parameter_mappings: [
            {
              card_id: 1,
              parameter_id: "param1",
              target: ["variable", ["template-tag", "foo"]],
            },
          ],
        }),
      ],
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
            dashcards: DASHBOARD.dashcards.map((dc) => dc.id),
          }),
        },
        parameterValues: { param1: "value1" },
      }),
    });

    // Start first fetch with param1=value1
    const firstFetch = store.dispatch(
      fetchCardDataAction({
        card: dashcard.card,
        dashcard,
        options: {},
      }),
    );

    await sleep(50);

    // Change parameter value to simulate a filter change
    store.dispatch({
      type: "metabase/dashboard/SET_PARAMETER_VALUES",
      payload: { param1: "value2" },
    });

    // Second fetch with different params should cancel the first
    const secondFetch = store.dispatch(
      fetchCardDataAction({
        card: dashcard.card,
        dashcard,
        options: {},
      }),
    );

    const firstResult = await firstFetch;
    const secondResult = await secondFetch;

    // First fetch was cancelled because parameters changed
    expect(firstResult.payload).toMatchObject({ result: null });
    // Second fetch completes with the API response
    expect(secondResult.payload).toMatchObject({ result: { foo: true } });
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

function setupConcurrencyTest(
  dashboardId: number,
  cardCount: number,
  { isEditing = false }: { isEditing?: boolean } = {},
) {
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

  // Non-editing path now uses the streaming batch endpoint. Register a mock
  // so the per-card code path and the batch code path both have something to
  // talk to.
  const batchCalls = setupDashboardCardQueryBatchEndpoint(
    dashboardId,
    dashcards.map((dc) => ({ id: dc.id, card_id: dc.card_id as number })),
  );

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
      editingDashboard: isEditing ? DASHBOARD : null,
    }),
    entities: createMockEntitiesState({ databases: [database] }),
    settings: createMockSettingsState(),
  };

  const getState = () => state;
  const dispatch = createMockDispatch(getState);

  return {
    dispatch,
    getState,
    getMaxConcurrent: () => maxConcurrent,
    dashcards,
    batchCalls,
  };
}

describe("fetchDashboardCardData", () => {
  it("should issue a single batch request for all cards on a normal dashboard", async () => {
    const dashboardId = 100;
    const { dispatch, getState, dashcards, batchCalls } = setupConcurrencyTest(
      dashboardId,
      8,
    );

    await fetchDashboardCardData()(dispatch as never, getState as never);

    expect(batchCalls).toHaveLength(1);

    const body = JSON.parse(String(batchCalls[0].init?.body ?? "{}"));
    expect(body.cards).toHaveLength(dashcards.length);
    expect(
      body.cards.map((c: { dashcard_id: number }) => c.dashcard_id),
    ).toEqual(dashcards.map((dc) => dc.id));
  });

  it("should make at most 5 simultaneous per-card requests on the editing fallback path", async () => {
    const { dispatch, getState, getMaxConcurrent } = setupConcurrencyTest(
      101,
      8,
      { isEditing: true },
    );

    await fetchDashboardCardData()(dispatch as never, getState as never);

    expect(getMaxConcurrent()).toBe(5);
  });

  it("should skip cached cards from the batch request when params match (#70534)", async () => {
    const dashboardId = 500;
    const dashcardId = 50;
    const cardId = 50;

    fetchMock.post(
      `/api/dashboard/${dashboardId}/card-query-batch`,
      new Response("", { headers: { "Content-Type": "application/x-ndjson" } }),
    );

    const database = createSampleDatabase();
    const dashcard = createMockDashboardCard({
      id: dashcardId,
      card_id: cardId,
      dashboard_id: dashboardId,
      card: createMockCard({ id: cardId }),
    });
    const DASHBOARD = createMockDashboard({
      id: dashboardId,
      dashcards: [dashcard],
    });

    const state: Partial<State> = {
      dashboard: createMockDashboardState({
        dashboardId: DASHBOARD.id,
        dashboards: {
          [DASHBOARD.id]: createMockStoreDashboard({
            ...DASHBOARD,
            dashcards: [dashcard.id],
          }),
        },
        dashcards: { [dashcard.id]: dashcard },
        // Pre-populate with a cached result whose json_query has no parameters,
        // matching what buildCardQuery will produce for an unparameterized dashboard.
        dashcardData: {
          [dashcardId]: {
            [cardId]: { json_query: { parameters: [] } } as never,
          },
        },
      }),
      entities: createMockEntitiesState({ databases: [database] }),
      settings: createMockSettingsState(),
    };

    const getState = () => state;
    const dispatch = createMockDispatch(getState);

    await fetchDashboardCardData()(dispatch as never, getState as never);

    const batchCalls = fetchMock.callHistory.calls(
      `/api/dashboard/${dashboardId}/card-query-batch`,
    );
    expect(batchCalls).toHaveLength(0);
  });

  it("should bypass cache when reload is true", async () => {
    const dashboardId = 501;
    const dashcardId = 51;
    const cardId = 51;

    fetchMock.post(
      `/api/dashboard/${dashboardId}/card-query-batch`,
      new Response("", { headers: { "Content-Type": "application/x-ndjson" } }),
    );

    const database = createSampleDatabase();
    const dashcard = createMockDashboardCard({
      id: dashcardId,
      card_id: cardId,
      dashboard_id: dashboardId,
      card: createMockCard({ id: cardId }),
    });
    const DASHBOARD = createMockDashboard({
      id: dashboardId,
      dashcards: [dashcard],
    });

    const state: Partial<State> = {
      dashboard: createMockDashboardState({
        dashboardId: DASHBOARD.id,
        dashboards: {
          [DASHBOARD.id]: createMockStoreDashboard({
            ...DASHBOARD,
            dashcards: [dashcard.id],
          }),
        },
        dashcards: { [dashcard.id]: dashcard },
        // Cached result that would otherwise satisfy the pre-filter.
        dashcardData: {
          [dashcardId]: {
            [cardId]: { json_query: { parameters: [] } } as never,
          },
        },
      }),
      entities: createMockEntitiesState({ databases: [database] }),
      settings: createMockSettingsState(),
    };

    const getState = () => state;
    const dispatch = createMockDispatch(getState);

    await fetchDashboardCardData({ reload: true })(
      dispatch as never,
      getState as never,
    );

    const batchCalls = fetchMock.callHistory.calls(
      `/api/dashboard/${dashboardId}/card-query-batch`,
    );
    expect(batchCalls).toHaveLength(1);
  });

  it("should not cancel in-flight requests from other tabs on tab switch (#70534)", async () => {
    const dashboardId = 300;
    const tab1 = createMockDashboardTab({
      id: 1,
      dashboard_id: dashboardId,
      name: "Tab 1",
    });
    const tab2 = createMockDashboardTab({
      id: 2,
      dashboard_id: dashboardId,
      name: "Tab 2",
    });

    const tab1Card = createMockDashboardCard({
      id: 10,
      card_id: 10,
      dashboard_id: dashboardId,
      dashboard_tab_id: tab1.id,
      card: createMockCard({ id: 10 }),
    });
    const tab2Card = createMockDashboardCard({
      id: 20,
      card_id: 20,
      dashboard_id: dashboardId,
      dashboard_tab_id: tab2.id,
      card: createMockCard({ id: 20 }),
    });

    let tab1QueryCount = 0;
    fetchMock.post(
      `/api/dashboard/${dashboardId}/dashcard/${tab1Card.id}/card/${tab1Card.card_id}/query`,
      () =>
        new Promise((resolve) => {
          tab1QueryCount++;
          // Slow query on Tab 1 (simulates a pivot table). Must be long
          // enough that the request is still in-flight when we navigate
          // back to Tab 1 in the test below.
          setTimeout(() => resolve({ data: [] }), 500);
        }),
    );
    fetchMock.post(
      `/api/dashboard/${dashboardId}/dashcard/${tab2Card.id}/card/${tab2Card.card_id}/query`,
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ data: [] }), 20);
        }),
    );

    const database = createSampleDatabase();
    const dashcards = [tab1Card, tab2Card];
    const DASHBOARD = createMockDashboard({
      id: dashboardId,
      tabs: [tab1, tab2],
      dashcards,
    });

    const state: Partial<State> = {
      dashboard: createMockDashboardState({
        dashboardId: DASHBOARD.id,
        selectedTabId: tab1.id,
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

    // Start loading Tab 1 (slow query)
    const tab1Fetch = fetchDashboardCardData()(
      dispatch as never,
      getState as never,
    );

    // Wait a bit to let Tab 1 request start, but not finish
    await new Promise<void>((res) => setTimeout(res, 50));

    // Switch to Tab 2
    (state.dashboard as DashboardState).selectedTabId = tab2.id;
    const tab2Fetch = fetchDashboardCardData()(
      dispatch as never,
      getState as never,
    );

    // Wait for Tab 2's fast query to finish, while Tab 1 is still in-flight
    await tab2Fetch;
    expect(tab1QueryCount).toBe(1);

    // Navigate back to Tab 1 while its query is still running. The
    // in-flight request should be detected as a duplicate (same parameters)
    // and reused — no new query execution.
    (state.dashboard as DashboardState).selectedTabId = tab1.id;
    const backToTab1Fetch = fetchDashboardCardData()(
      dispatch as never,
      getState as never,
    );

    await Promise.all([tab1Fetch, backToTab1Fetch]);

    // Tab 1's query should have been called exactly once across the entire
    // sequence: initial load -> switch to Tab 2 -> switch back to Tab 1.
    // Before the fix, the batch cancellation loop would cancel Tab 1's
    // in-flight request, causing a re-execution on return.
    expect(tab1QueryCount).toBe(1);
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
