import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import {
  setupDashboardQueryMetadataEndpoint,
  setupDashboardsEndpoints,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import {
  buildCardQueryBatchNdjson,
  setupDashboardCardQueryBatchEndpoint,
} from "__support__/server-mocks/dashcard";
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

  it("should not re-fetch a card whose params match an in-flight request (#70534)", async () => {
    // Drives two back-to-back fetchDashboardCardData calls; the second should
    // see the first's cards in cardDataCancelDeferreds with matching params
    // and skip them from the new batch.
    const dashboardId = 301;
    const dashcard = createMockDashboardCard({
      id: 30,
      card_id: 30,
      dashboard_id: dashboardId,
      card: createMockCard({ id: 30 }),
    });

    let firstResolve: (() => void) | null = null;
    const firstResponseBody = buildCardQueryBatchNdjson([
      { id: dashcard.id, card_id: dashcard.card_id as number },
    ]);
    fetchMock.post(
      `path:/api/dashboard/${dashboardId}/card-query-batch`,
      () =>
        new Promise((resolve) => {
          firstResolve = () =>
            resolve(
              new Response(firstResponseBody, {
                headers: { "Content-Type": "application/x-ndjson" },
              }),
            );
        }),
      { repeat: 1 },
    );

    const database = createSampleDatabase();
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
      }),
      entities: createMockEntitiesState({ databases: [database] }),
      settings: createMockSettingsState(),
    };
    const getState = () => state;
    const dispatch = createMockDispatch(getState);

    // First fetch — request hangs (firstResolve not yet called).
    const firstFetch = fetchDashboardCardData()(
      dispatch as never,
      getState as never,
    );
    await new Promise<void>((res) => setTimeout(res, 10));

    // Second fetch with the same params — pre-filter should see the in-flight
    // entry in cardDataCancelDeferreds and skip the card from the new batch.
    // No second request should fire.
    await fetchDashboardCardData()(dispatch as never, getState as never);

    expect(
      fetchMock.callHistory.calls(
        `path:/api/dashboard/${dashboardId}/card-query-batch`,
      ),
    ).toHaveLength(1);

    // Resolve the first batch so the test cleans up.
    firstResolve!();
    await firstFetch;
  });

  it("includes permission-stripped cards (no dataset_query) in the batch request so the backend can emit a 403 card-error", async () => {
    const dashboardId = 700;
    const viewableDashcardId = 71;
    const viewableCardId = 71;
    const restrictedDashcardId = 72;
    const restrictedCardId = 72;

    const database = createSampleDatabase();
    const viewableDashcard = createMockDashboardCard({
      id: viewableDashcardId,
      card_id: viewableCardId,
      dashboard_id: dashboardId,
      card: createMockCard({ id: viewableCardId }),
    });
    // Cards the current user can't read are returned by /api/dashboard/:id
    // with dataset_query stripped off the embedded card.
    const restrictedDashcard = createMockDashboardCard({
      id: restrictedDashcardId,
      card_id: restrictedCardId,
      dashboard_id: dashboardId,
      card: createMockCard({
        id: restrictedCardId,
        dataset_query: undefined as never,
      }),
    });

    const batchCalls = setupDashboardCardQueryBatchEndpoint(dashboardId, [
      { id: viewableDashcardId, card_id: viewableCardId },
      { id: restrictedDashcardId, card_id: restrictedCardId },
    ]);

    const DASHBOARD = createMockDashboard({
      id: dashboardId,
      dashcards: [viewableDashcard, restrictedDashcard],
    });
    const state: Partial<State> = {
      dashboard: createMockDashboardState({
        dashboardId: DASHBOARD.id,
        dashboards: {
          [DASHBOARD.id]: createMockStoreDashboard({
            ...DASHBOARD,
            dashcards: [viewableDashcardId, restrictedDashcardId],
          }),
        },
        dashcards: {
          [viewableDashcardId]: viewableDashcard,
          [restrictedDashcardId]: restrictedDashcard,
        },
      }),
      entities: createMockEntitiesState({ databases: [database] }),
      settings: createMockSettingsState(),
    };

    const dispatch = createMockDispatch(() => state);
    await fetchDashboardCardData()(dispatch as never, (() => state) as never);

    expect(batchCalls).toHaveLength(1);
    const body = JSON.parse(String(batchCalls[0].init?.body ?? "{}"));
    expect(
      body.cards.map((c: { dashcard_id: number }) => c.dashcard_id).sort(),
    ).toEqual([viewableDashcardId, restrictedDashcardId]);
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
