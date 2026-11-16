import fetchMock from "fetch-mock";

import { getMainStore } from "__support__/entities-store";
import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupDashboardQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { createMockDashboardState, createMockState } from "__support__/state";
import { registerVisualizations } from "metabase/visualizations/register";
import type { VisualizationDisplay } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockDashboard,
  createMockDashboardQueryMetadata,
  createMockDataset,
} from "metabase-types/api/mocks";

import { addCardToDashboard } from "./cards-typed";
import { updateDashboardAndCards } from "./save";

registerVisualizations();

const DASHBOARD = createMockDashboard({ id: 1, dashcards: [] });

// The size a question card gets when it is added to a dashboard, by display.
// This table is an independent copy of the sizes in CARD_SIZE_DEFAULTS_JSON
// (metabase.dashboards.constants) on purpose, so that an accidental change to a
// default size fails this test. When a default size changes deliberately,
// update this table too.
const DEFAULT_SIZES: Array<[VisualizationDisplay, number, number]> = [
  ["table", 12, 9],
  ["bar", 12, 6],
  ["line", 12, 6],
  ["pie", 12, 8],
  ["row", 12, 6],
  ["area", 12, 6],
  ["combo", 12, 6],
  ["pivot", 12, 9],
  ["scatter", 12, 6],
  ["funnel", 12, 6],
  ["object", 12, 9],
  ["smartscalar", 6, 3],
  ["waterfall", 14, 6],
  ["scalar", 6, 3],
  ["gauge", 12, 6],
  ["progress", 12, 6],
  ["map", 12, 6],
];

function setup(display: VisualizationDisplay) {
  const card = createMockCard({ id: 1, display });
  setupCardEndpoints(card);
  setupCardQueryEndpoints(card, createMockDataset());
  fetchMock.post("path:/api/card/pivot/1/query", createMockDataset());
  setupCardQueryMetadataEndpoint(card, createMockCardQueryMetadata());
  fetchMock.put("path:/api/dashboard/1", DASHBOARD);
  setupDashboardQueryMetadataEndpoint(
    DASHBOARD,
    createMockDashboardQueryMetadata(),
  );

  const dashboardState = createMockDashboardState({
    dashboardId: DASHBOARD.id,
    dashboards: { [DASHBOARD.id]: { ...DASHBOARD, dashcards: [] } },
    editingDashboard: DASHBOARD,
    dashcards: {},
  });

  return getMainStore(createMockState({ dashboard: dashboardState }));
}

describe("adding a card to a dashboard", () => {
  it.each(DEFAULT_SIZES)(
    "should save a new %s card with its default size (%ix%i)",
    async (display, width, height) => {
      const store = setup(display);

      await addCardToDashboard({
        dashId: DASHBOARD.id,
        tabId: null,
        cardId: 1,
      })(store.dispatch);
      await store.dispatch(updateDashboardAndCards());

      const call = fetchMock.callHistory.lastCall("path:/api/dashboard/1", {
        method: "PUT",
      });
      const body: unknown = JSON.parse(String(call?.options.body));
      expect(body).toMatchObject({
        dashcards: [{ card_id: 1, size_x: width, size_y: height }],
      });
    },
  );
});
