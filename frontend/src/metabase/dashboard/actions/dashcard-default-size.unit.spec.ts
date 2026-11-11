import type { Store } from "@reduxjs/toolkit";

import { getMainStore } from "__support__/entities-store";
import { createMockDashboardState, createMockState } from "__support__/state";
import type { State } from "metabase/redux/store";
import { registerVisualizations } from "metabase/visualizations/register";
import type { VisualizationDisplay } from "metabase-types/api";
import { createMockCard, createMockDashboard } from "metabase-types/api/mocks";

import { getDashCardById } from "../selectors";

import { addDashCardToDashboard } from "./cards-typed";

registerVisualizations();

const DASHBOARD = createMockDashboard({ id: 1, dashcards: [] });

// The size a question card gets when it is added to a dashboard, by display
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

function setup() {
  const dashboardState = createMockDashboardState({
    dashboardId: DASHBOARD.id,
    dashboards: { [DASHBOARD.id]: { ...DASHBOARD, dashcards: [] } },
    editingDashboard: DASHBOARD,
    dashcards: {},
  });

  // Unjustified type cast. FIXME
  return getMainStore(
    createMockState({ dashboard: dashboardState }),
  ) as Store<State>;
}

describe("addDashCardToDashboard", () => {
  it.each(DEFAULT_SIZES)(
    "should give a new %s card its default size (%ix%i)",
    (display, width, height) => {
      const store = setup();
      const card = createMockCard({ id: 1, display });

      addDashCardToDashboard({
        dashId: DASHBOARD.id,
        tabId: null,
        dashcardOverrides: { id: -1, card, card_id: card.id },
      })(store.dispatch, store.getState);

      const dashcard = getDashCardById(store.getState(), -1);
      expect(dashcard).toMatchObject({ size_x: width, size_y: height });
    },
  );
});
