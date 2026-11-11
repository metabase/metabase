import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { setupDashboardQueryMetadataEndpoint } from "__support__/server-mocks";
import {
  createMockDashboardState,
  createMockSettingsState,
  createMockStoreDashboard,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { Api } from "metabase/api";
import type { ClickBehavior } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { dashboardReducers } from "../reducers";

import { updateDashboardAndCards } from "./save";

const NEW_DASHCARD_TEMP_ID = -1;
const NEW_DASHCARD_REAL_ID = 99;
const CARD_ID = 1;

function setup() {
  const database = createSampleDatabase();

  // The card the user added during editing only exists locally, with a
  // temporary negative id. The save response assigns it a real id.
  const tempDashcard = createMockDashboardCard({
    id: NEW_DASHCARD_TEMP_ID,
    card_id: CARD_ID,
    dashboard_id: 1,
    card: createMockCard({ id: CARD_ID }),
  });

  const savedDashboard = createMockDashboard({
    id: 1,
    name: "Edited",
    dashcards: [
      createMockDashboardCard({
        id: NEW_DASHCARD_REAL_ID,
        card_id: CARD_ID,
        dashboard_id: 1,
        card: createMockCard({ id: CARD_ID }),
      }),
    ],
  });

  const state = {
    dashboard: createMockDashboardState({
      dashboardId: 1,
      dashboards: {
        "1": createMockStoreDashboard({
          id: 1,
          name: "Edited",
          dashcards: [NEW_DASHCARD_TEMP_ID],
        }),
      },
      dashcards: {
        [NEW_DASHCARD_TEMP_ID]: tempDashcard,
      },
      // Differs from the current dashboard (no dashcards), so the save proceeds.
      editingDashboard: createMockDashboard({
        id: 1,
        name: "Original",
        dashcards: [],
      }),
    }),
    entities: createMockEntitiesState({ databases: [database] }),
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

  fetchMock.put("path:/api/dashboard/1", savedDashboard);
  setupDashboardQueryMetadataEndpoint(
    savedDashboard,
    createMockDashboardQueryMetadata({ databases: [database] }),
  );
  fetchMock.post(
    `path:/api/dashboard/1/dashcard/${NEW_DASHCARD_REAL_ID}/card/${CARD_ID}/query`,
    { data: [] },
  );

  return { store };
}

describe("updateDashboardAndCards", () => {
  it("refreshes dashboard state from the save response without re-fetching", async () => {
    const { store } = setup();

    await store.dispatch(updateDashboardAndCards());

    const { dashboards, dashcards } = store.getState().dashboard;

    // The temporary dashcard id was replaced by the real one from the response.
    expect(dashboards["1"]?.dashcards).toEqual([NEW_DASHCARD_REAL_ID]);
    expect(dashcards[NEW_DASHCARD_REAL_ID]).toBeDefined();

    expect(
      fetchMock.callHistory.called("path:/api/dashboard/1", { method: "PUT" }),
    ).toBe(true);
    // The state is rebuilt from the PUT response, so no GET is issued.
    expect(
      fetchMock.callHistory.called("path:/api/dashboard/1", { method: "GET" }),
    ).toBe(false);
  });

  describe("invalid click behavior", () => {
    const DASHCARD_ID = 5;
    const validClickBehavior: ClickBehavior = {
      type: "link",
      linkType: "url",
      linkTemplate: "https://example.com",
    };
    const invalidClickBehavior: ClickBehavior = {
      type: "link",
      linkType: "url",
      linkTemplate: "",
    };

    function setupClickBehavior(startingClickBehavior?: ClickBehavior) {
      const database = createSampleDatabase();
      const card = createMockCard({ id: CARD_ID });
      const createDashcard = (visualization_settings = {}) =>
        createMockDashboardCard({
          id: DASHCARD_ID,
          card_id: CARD_ID,
          dashboard_id: 1,
          card,
          visualization_settings,
        });

      const savedDashboard = createMockDashboard({
        id: 1,
        dashcards: [createDashcard()],
      });

      const store = getStore(
        {
          [Api.reducerPath]: Api.reducer,
          dashboard: dashboardReducers,
          entities: (state = {}) => state,
          settings: (state = {}) => state,
        },
        {
          dashboard: createMockDashboardState({
            dashboardId: 1,
            dashboards: {
              "1": createMockStoreDashboard({
                id: 1,
                dashcards: [DASHCARD_ID],
              }),
            },
            dashcards: {
              [DASHCARD_ID]: createDashcard({
                click_behavior: invalidClickBehavior,
                other: "setting",
              }),
            },
            editingDashboard: createMockDashboard({
              id: 1,
              dashcards: [
                createDashcard(
                  startingClickBehavior
                    ? { click_behavior: startingClickBehavior }
                    : {},
                ),
              ],
            }),
          }),
          entities: createMockEntitiesState({ databases: [database] }),
          settings: createMockSettingsState(),
        },
        [Api.middleware],
      );

      fetchMock.put("path:/api/dashboard/1", savedDashboard);
      setupDashboardQueryMetadataEndpoint(
        savedDashboard,
        createMockDashboardQueryMetadata({ databases: [database] }),
      );
      fetchMock.post(
        `path:/api/dashboard/1/dashcard/${DASHCARD_ID}/card/${CARD_ID}/query`,
        { data: [] },
      );

      return { store };
    }

    async function getSavedVisualizationSettings(
      startingClickBehavior?: ClickBehavior,
    ) {
      const { store } = setupClickBehavior(startingClickBehavior);
      await store.dispatch(updateDashboardAndCards());

      const call = fetchMock.callHistory.lastCall("path:/api/dashboard/1", {
        method: "PUT",
      });
      const body = JSON.parse(String(call?.options?.body));
      return body.dashcards[0].visualization_settings;
    }

    it("restores the pre-edit click behavior", async () => {
      expect(await getSavedVisualizationSettings(validClickBehavior)).toEqual({
        click_behavior: validClickBehavior,
        other: "setting",
      });
    });

    it("removes the click behavior when there was none before editing", async () => {
      expect(await getSavedVisualizationSettings()).toEqual({
        other: "setting",
      });
    });
  });
});
