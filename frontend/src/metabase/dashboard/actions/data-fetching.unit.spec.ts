import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import {
  setupDashboardQueryMetadataEndpoint,
  setupDashboardsEndpoints,
  setupDatabaseEndpoints,
  setupGoalValuesEndpoint,
} from "__support__/server-mocks";
import type { StoreSeedState } from "__support__/state";
import {
  createMockDashboardState,
  createMockSettingsState,
  createMockStoreDashboard,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { waitFor } from "__support__/ui";
import { Api } from "metabase/api";
import type { DashboardState, State } from "metabase/redux/store";
import { isQuestionDashCard } from "metabase/utils/dashboard";
import { defer } from "metabase/utils/promise";
import type {
  CardId,
  Dashboard,
  DashboardCard,
  Dataset,
  GoalSegment,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDashboardTab,
  createMockDataset,
  createMockDatasetData,
  createMockReferencedEntitiesResults,
  createMockVirtualCard,
  createMockVirtualDashCard,
  createMockVisualizerDashboardCard,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { dashboardReducers } from "../reducers";
import { getLastSeenTabDashcards } from "../selectors";

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
  describe("while the query metadata is still loading (DSN-749)", () => {
    let queryMetadataRequest = defer();

    const setupDeferredQueryMetadata = (dashboardId: number) => {
      queryMetadataRequest = defer();
      fetchMock.get(`path:/api/dashboard/${dashboardId}/query_metadata`, () =>
        queryMetadataRequest.promise.then(() =>
          createMockDashboardQueryMetadata(),
        ),
      );
    };

    // Never leave the request pending, or teardown waits on it when a test fails.
    afterEach(() => queryMetadataRequest.resolve());

    it("publishes the dashboard layout before the fetch finishes", async () => {
      const dashboard = createMockDashboard({
        id: 1,
        dashcards: [createMockDashboardCard({ id: 10, dashboard_id: 1 })],
      });
      const store = setup();
      setupDashboardsEndpoints([dashboard]);
      setupDeferredQueryMetadata(1);

      const fetchResult = store.dispatch(
        fetchDashboard({ dashId: 1, queryParams: {}, options: {} }),
      );

      // The skeleton can draw the real layout while the dashboard still loads.
      await waitFor(() => {
        expect(getLastSeenTabDashcards(store.getState(), 1)).toHaveLength(1);
      });
      expect(store.getState().dashboard.dashboardId).toBeNull();

      queryMetadataRequest.resolve();
      await expect(fetchResult).resolves.toHaveProperty(
        "type",
        "metabase/dashboard/FETCH_DASHBOARD/fulfilled",
      );
      expect(store.getState().dashboard.dashboardId).toBe(1);
    });

    it("does not publish the layout early when refetching a dashboard that is already on screen", async () => {
      const store = setup({
        dashboard: createMockDashboardState({
          dashboardId: 1,
          dashboards: {
            1: createMockStoreDashboard({ id: 1, name: "Old", dashcards: [] }),
          },
        }),
      });
      setupDashboardsEndpoints([createMockDashboard({ id: 1, name: "New" })]);
      setupDeferredQueryMetadata(1);

      const fetchResult = store.dispatch(
        fetchDashboard({ dashId: 1, queryParams: {}, options: {} }),
      );

      await waitFor(() => {
        expect(
          fetchMock.callHistory.called("path:/api/dashboard/1/query_metadata"),
        ).toBe(true);
      });
      // Let the dashboard GET resolve before checking nothing was merged early.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(store.getState().dashboard.dashboards[1].name).toBe("Old");

      queryMetadataRequest.resolve();
      await fetchResult;
      expect(store.getState().dashboard.dashboards[1].name).toBe("New");
    });
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

  it("loads an embedded dashboard with virtual cards without mutating the frozen RTK response", async () => {
    // RTK Query freezes its cached responses, so the virtual-card merge must
    // not mutate the returned dashcards in place (metabase public/embed/x-ray
    // dashboards otherwise fail to load).
    const token = "header.payload.signature";
    const dashboard = createMockDashboard({
      // Unjustified type cast. FIXME
      id: token as unknown as number,
      dashcards: [
        createMockVirtualDashCard({
          id: 1,
          visualization_settings: {
            virtual_card: createMockVirtualCard({ display: "heading" }),
            text: "A heading",
          },
        }),
      ],
    });

    fetchMock.get(`path:/api/embed/dashboard/${token}`, dashboard);

    const store = setup();

    const result = await store.dispatch(
      fetchDashboard({
        dashId: token,
        queryParams: {},
        options: {},
      }),
    );

    expect(result.type).toBe("metabase/dashboard/FETCH_DASHBOARD/fulfilled");
  });

  it("uses a prefetched dashboard instead of re-fetching it", async () => {
    const dashboard = createMockDashboard({ id: 1, name: "Prefetched" });

    // setup() mocks GET /api/dashboard/1, so reaching it here would succeed —
    // the assertion below proves the prefetched path skips it entirely.
    const store = setup({ dashboards: [dashboard] });

    const result = await store.dispatch(
      fetchDashboard({
        dashId: 1,
        queryParams: {},
        options: { prefetchedDashboard: dashboard },
      }),
    );

    expect(result.type).toBe("metabase/dashboard/FETCH_DASHBOARD/fulfilled");
    expect(result.payload).toMatchObject({
      dashboardId: 1,
      dashboard: { id: 1, name: "Prefetched" },
    });
    expect(
      fetchMock.callHistory.called("path:/api/dashboard/1", { method: "GET" }),
    ).toBe(false);
  });
});

/**
 * Creates a dispatch/getState pair that runs thunks against the mock dashboard
 * `state` but routes RTK Query lifecycle actions to a real (api-only) store, so
 * the RTK-backed dashcard query endpoints execute. The dashboard `dashcardData`
 * reducer is intentionally bypassed: these concurrency tests only assert on
 * the requests that get made, not on the dashboard state.
 */
function createMockDispatch(getMockState: () => Partial<State>) {
  const apiStore = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);

  const getState = (): Partial<State> => ({
    ...getMockState(),
    [Api.reducerPath]: apiStore.getState()[Api.reducerPath],
  });

  const dispatch = (action: any): any => {
    if (typeof action === "function") {
      return action(dispatch, getState);
    }
    // RTK Query lifecycle actions need the real api store + middleware; other
    // (dashboard) plain actions don't affect what these tests assert.
    if (
      typeof action?.type === "string" &&
      action.type.startsWith(`${Api.reducerPath}/`)
    ) {
      return apiStore.dispatch(action);
    }
    return Promise.resolve(action);
  };

  return { dispatch, getState };
}

type ConcurrencyTestOpts = {
  cardCount: number;
  dashboardId: number;
  hasGoals?: boolean;
};

function setupConcurrencyTest({
  cardCount,
  dashboardId,
  hasGoals = false,
}: ConcurrencyTestOpts) {
  let currentConcurrent = 0;
  let maxConcurrent = 0;

  const database = createSampleDatabase();
  const dashcards = Array.from({ length: cardCount }, (_, i) =>
    createMockDashboardCard({
      id: i + 1,
      card_id: i + 1,
      dashboard_id: dashboardId,
      card: createMockCard({
        id: i + 1,
        display: "progress",
        visualization_settings: hasGoals
          ? // a source per card, so no two goal requests are deduplicated
            { "progress.goal": { type: "card", id: 100 + i, column: "goal" } }
          : {},
      }),
    }),
  );

  function respondLater<T>(response: T) {
    return new Promise<T>((resolve) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      setTimeout(() => {
        currentConcurrent--;
        resolve(response);
      }, 50);
    });
  }

  dashcards.forEach((dashcard) => {
    fetchMock.post(
      `/api/dashboard/${dashboardId}/dashcard/${dashcard.id}/card/${dashcard.card_id}/query`,
      () => respondLater({ data: [] }),
    );
  });
  setupGoalValuesEndpoint(() => respondLater({}));

  const DASHBOARD = createMockDashboard({ id: dashboardId, dashcards });
  const state: Partial<StoreSeedState> = {
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

  const { dispatch, getState } = createMockDispatch(() => state);

  return { dispatch, getState, getMaxConcurrent: () => maxConcurrent };
}

describe("fetchDashboardCardData", () => {
  it("should make at most 5 api calls simultaneously", async () => {
    const { dispatch, getState, getMaxConcurrent } = setupConcurrencyTest({
      cardCount: 8,
      dashboardId: 100,
    });

    // Unjustified type cast. FIXME
    await fetchDashboardCardData()(dispatch as never, getState as never);

    expect(getMaxConcurrent()).toBe(5);
  });

  it("should count the goal request of a dashcard against the limit of 5 simultaneous api calls", async () => {
    const { dispatch, getState, getMaxConcurrent } = setupConcurrencyTest({
      cardCount: 8,
      dashboardId: 100,
      hasGoals: true,
    });

    // the mock dispatch and getState implement only what the thunk calls
    await fetchDashboardCardData()(dispatch as never, getState as never);

    expect(getMaxConcurrent()).toBe(4);
    expect(
      fetchMock.callHistory.calls("path:/api/dynamic-goal/values"),
    ).toHaveLength(8);
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

    const state: Partial<StoreSeedState> = {
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

    const { dispatch, getState } = createMockDispatch(() => state);

    // Start loading Tab 1 (slow query)
    const tab1Fetch = fetchDashboardCardData()(
      // Unjustified type cast. FIXME
      dispatch as never,
      // Unjustified type cast. FIXME
      getState as never,
    );

    // Wait a bit to let Tab 1 request start, but not finish
    await new Promise<void>((res) => setTimeout(res, 50));

    // Switch to Tab 2
    (state.dashboard as DashboardState).selectedTabId = tab2.id;
    const tab2Fetch = fetchDashboardCardData()(
      // Unjustified type cast. FIXME
      dispatch as never,
      // Unjustified type cast. FIXME
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
      // Unjustified type cast. FIXME
      dispatch as never,
      // Unjustified type cast. FIXME
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

describe("fetchCardDataAction with goal references", () => {
  const DASHBOARD_ID = 5;
  const PUBLIC_DASHBOARD_UUID = "6b9a7fcb-27d1-4a32-9e5a-5d4bd2d8b1d3";
  const QUERY_URL = `/api/dashboard/${DASHBOARD_ID}/dashcard/1/card/1/query`;
  const SERIES_QUERY_URL = `/api/dashboard/${DASHBOARD_ID}/dashcard/1/card/2/query`;
  const PUBLIC_QUERY_URL = `path:/api/public/dashboard/${PUBLIC_DASHBOARD_UUID}/dashcard/1/card/1`;
  const GOAL_VALUES_URL = "path:/api/dynamic-goal/values";

  const REF_SEGMENTS: GoalSegment[] = [
    { min: 0, max: { type: "card", id: 9, column: "total" }, color: "red" },
  ];
  const GOAL_SOURCES = [{ type: "card", id: 9, columns: ["total"] }];
  const GOAL_VALUES = createMockReferencedEntitiesResults({
    column: "total",
    value: 250,
  });

  it("fetches the goal values next to the query and puts them in the result", async () => {
    setupGoalValuesEndpoint(GOAL_VALUES);
    const { store, card, dashcard } = setupGaugeDashcard();

    const result = await store.dispatch(
      fetchCardDataAction({ card, dashcard, options: { reload: true } }),
    );

    expect(fetchMock.callHistory.called(QUERY_URL)).toBe(true);
    expect(await getLastGoalValuesRequestBody()).toEqual({
      sources: GOAL_SOURCES,
      dashboard_id: DASHBOARD_ID,
    });
    expect(result.payload).toMatchObject({
      result: { data: { referenced_entities: GOAL_VALUES } },
    });
  });

  it("fetches the goal values of unsaved dashcard settings", async () => {
    setupGoalValuesEndpoint(GOAL_VALUES);
    const { store, card, dashcard } = setupGaugeDashcard({
      cardSettings: {},
      editing: true,
      unsavedDashcardSettings: { "gauge.segments": REF_SEGMENTS },
    });

    await store.dispatch(
      fetchCardDataAction({ card, dashcard, options: { reload: true } }),
    );

    expect(await getLastGoalValuesRequestBody()).toEqual({
      sources: GOAL_SOURCES,
      dashboard_id: DASHBOARD_ID,
    });
  });

  it("skips the cache for the goal values when the query skips it", async () => {
    setupGoalValuesEndpoint(GOAL_VALUES);
    const { store, card, dashcard } = setupGaugeDashcard();

    await store.dispatch(
      fetchCardDataAction({
        card,
        dashcard,
        options: { ignoreCache: true, reload: true },
      }),
    );

    expect(await getLastGoalValuesRequestBody()).toEqual({
      sources: GOAL_SOURCES,
      dashboard_id: DASHBOARD_ID,
      ignore_cache: true,
    });
  });

  it("shows the query result with failed goals when fetching the goal values fails", async () => {
    setupGoalValuesEndpoint(500);
    const { store, card, dashcard } = setupGaugeDashcard();

    const result = await store.dispatch(
      fetchCardDataAction({ card, dashcard, options: { reload: true } }),
    );

    expect(result.payload).toMatchObject({
      result: {
        data: {
          rows: [[10]],
          referenced_entities: {
            card: { 9: { status: "failed" } },
            measure: {},
          },
        },
      },
    });
  });

  it("returns the cached result without fetching the goal values again when the parameters did not change", async () => {
    setupGoalValuesEndpoint(GOAL_VALUES);
    const { store, card, dashcard, lastResult } = setupGaugeDashcard();

    const result = await store.dispatch(
      fetchCardDataAction({ card, dashcard, options: {} }),
    );

    expect(fetchMock.callHistory.called(QUERY_URL)).toBe(false);
    expect(fetchMock.callHistory.called(GOAL_VALUES_URL)).toBe(false);
    expect(result.payload).toMatchObject({ result: lastResult });
  });

  it("fetches the goal values of a visualizer dashcard's chart", async () => {
    setupGoalValuesEndpoint(GOAL_VALUES);
    const { store, card, dashcard } = setupVisualizerDashcard();

    const result = await store.dispatch(
      fetchCardDataAction({ card, dashcard, options: { reload: true } }),
    );

    expect(await getLastGoalValuesRequestBody()).toEqual({
      sources: GOAL_SOURCES,
      dashboard_id: DASHBOARD_ID,
    });
    expect(result.payload).toMatchObject({
      result: { data: { referenced_entities: GOAL_VALUES } },
    });
  });

  it("does not fetch goal values for a visualizer dashcard's series card", async () => {
    setupGoalValuesEndpoint(GOAL_VALUES);
    const { store, seriesCard, dashcard } = setupVisualizerDashcard();

    await store.dispatch(
      fetchCardDataAction({
        card: seriesCard,
        dashcard,
        options: { reload: true },
      }),
    );

    expect(fetchMock.callHistory.called(SERIES_QUERY_URL)).toBe(true);
    expect(fetchMock.callHistory.called(GOAL_VALUES_URL)).toBe(false);
  });

  it("does not fetch goal values for a series card whose own settings reference a goal", async () => {
    setupGoalValuesEndpoint(GOAL_VALUES);
    const card = createMockCard({ id: 1, display: "line" });
    const seriesCard = createMockCard({
      id: 2,
      display: "line",
      visualization_settings: {
        "graph.show_goal": true,
        "graph.goal_value": { type: "card", id: 9, column: "total" },
      },
    });
    const dashcard = createMockDashboardCard({
      id: 1,
      card_id: card.id,
      dashboard_id: DASHBOARD_ID,
      card,
      series: [seriesCard],
    });
    const store = setupDashcardStore({
      dashcard,
      lastResults: {
        [card.id]: createCachedResult(),
        [seriesCard.id]: createCachedResult(),
      },
    });

    await store.dispatch(
      fetchCardDataAction({
        card: seriesCard,
        dashcard,
        options: { reload: true },
      }),
    );

    expect(fetchMock.callHistory.called(SERIES_QUERY_URL)).toBe(true);
    expect(fetchMock.callHistory.called(GOAL_VALUES_URL)).toBe(false);
  });

  it("does not fetch goal values for a dashcard without goal references", async () => {
    setupGoalValuesEndpoint(GOAL_VALUES);
    const { store, card, dashcard } = setupGaugeDashcard({ cardSettings: {} });

    await store.dispatch(
      fetchCardDataAction({ card, dashcard, options: { reload: true } }),
    );

    expect(fetchMock.callHistory.called(QUERY_URL)).toBe(true);
    expect(fetchMock.callHistory.called(GOAL_VALUES_URL)).toBe(false);
  });

  it("fetches the goal values of a public dashcard from its public goal route", async () => {
    const goalValuesUrl = `${PUBLIC_QUERY_URL}/goal-values`;
    fetchMock.get(goalValuesUrl, GOAL_VALUES);
    fetchMock.get(PUBLIC_QUERY_URL, createCachedResult());
    const card = createMockCard({
      id: 1,
      display: "gauge",
      visualization_settings: { "gauge.segments": REF_SEGMENTS },
    });
    const dashcard = createMockDashboardCard({
      id: 1,
      card_id: card.id,
      dashboard_id: PUBLIC_DASHBOARD_UUID,
      card,
    });
    const dashboard = createMockDashboard({
      id: PUBLIC_DASHBOARD_UUID,
      dashcards: [dashcard],
    });
    const store = setup({
      dashboards: [dashboard],
      dashboard: createMockDashboardState({
        dashboardId: PUBLIC_DASHBOARD_UUID,
        dashboards: {
          [PUBLIC_DASHBOARD_UUID]: createMockStoreDashboard({
            ...dashboard,
            dashcards: [dashcard.id],
          }),
        },
        dashcards: { [dashcard.id]: dashcard },
      }),
    });

    const result = await store.dispatch(
      fetchCardDataAction({ card, dashcard, options: { reload: true } }),
    );

    expect(fetchMock.callHistory.called(goalValuesUrl)).toBe(true);
    expect(fetchMock.callHistory.called(GOAL_VALUES_URL)).toBe(false);
    expect(result.payload).toMatchObject({
      result: { data: { referenced_entities: GOAL_VALUES } },
    });
  });

  function setupGaugeDashcard({
    cardSettings = { "gauge.segments": REF_SEGMENTS },
    editing = false,
    unsavedDashcardSettings,
  }: {
    cardSettings?: VisualizationSettings;
    editing?: boolean;
    unsavedDashcardSettings?: VisualizationSettings;
  } = {}) {
    const card = createMockCard({
      id: 1,
      display: "gauge",
      visualization_settings: cardSettings,
    });
    const savedDashcard = createMockDashboardCard({
      id: 1,
      card_id: card.id,
      dashboard_id: DASHBOARD_ID,
      card,
    });
    const dashcard =
      unsavedDashcardSettings != null
        ? { ...savedDashcard, visualization_settings: unsavedDashcardSettings }
        : savedDashcard;
    const lastResult = createCachedResult();
    const dashboard = createMockDashboard({
      id: DASHBOARD_ID,
      dashcards: [savedDashcard],
    });

    const store = setup({
      dashboards: [dashboard],
      dashboard: createMockDashboardState({
        dashboardId: DASHBOARD_ID,
        dashboards: {
          [DASHBOARD_ID]: createMockStoreDashboard({
            ...dashboard,
            dashcards: [dashcard.id],
          }),
        },
        dashcards: { [dashcard.id]: dashcard },
        dashcardData: { [dashcard.id]: { [card.id]: lastResult } },
        editingDashboard: editing ? dashboard : null,
      }),
    });

    fetchMock.post(QUERY_URL, createCachedResult());

    return { store, card, dashcard, lastResult };
  }

  function setupVisualizerDashcard() {
    const card = createMockCard({ id: 1, display: "table" });
    const seriesCard = createMockCard({ id: 2, display: "table" });
    const dashcard = createMockVisualizerDashboardCard({
      id: 1,
      card_id: card.id,
      dashboard_id: DASHBOARD_ID,
      card,
      series: [seriesCard],
      visualization_settings: {
        visualization: {
          display: "gauge",
          columnValuesMapping: {},
          settings: { "gauge.segments": REF_SEGMENTS },
        },
      },
    });
    const store = setupDashcardStore({
      dashcard,
      lastResults: {
        [card.id]: createCachedResult(),
        [seriesCard.id]: createCachedResult(),
      },
    });

    return { store, card, seriesCard, dashcard };
  }

  function setupDashcardStore({
    dashcard,
    lastResults,
  }: {
    dashcard: DashboardCard;
    lastResults: Record<CardId, Dataset>;
  }) {
    const dashboard = createMockDashboard({
      id: DASHBOARD_ID,
      dashcards: [dashcard],
    });

    const store = setup({
      dashboards: [dashboard],
      dashboard: createMockDashboardState({
        dashboardId: DASHBOARD_ID,
        dashboards: {
          [DASHBOARD_ID]: createMockStoreDashboard({
            ...dashboard,
            dashcards: [dashcard.id],
          }),
        },
        dashcards: { [dashcard.id]: dashcard },
        dashcardData: { [dashcard.id]: lastResults },
      }),
    });

    fetchMock.post(QUERY_URL, createCachedResult());
    fetchMock.post(SERIES_QUERY_URL, createCachedResult());

    return store;
  }

  function createCachedResult() {
    return createMockDataset({
      data: createMockDatasetData({
        cols: [createMockColumn({ name: "count" })],
        rows: [[10]],
      }),
    });
  }

  async function getLastGoalValuesRequestBody(): Promise<unknown> {
    const call = fetchMock.callHistory.lastCall(GOAL_VALUES_URL);
    return call?.request?.json();
  }
});

describe("reloadDashboardCards", () => {
  it("should make at most 5 api calls simultaneously", async () => {
    const { dispatch, getState, getMaxConcurrent } = setupConcurrencyTest({
      cardCount: 8,
      dashboardId: 200,
    });

    // Unjustified type cast. FIXME
    await reloadDashboardCards()(dispatch as never, getState as never);

    expect(getMaxConcurrent()).toBe(5);
  });
});
