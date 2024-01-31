import { createAction } from "metabase/lib/redux";
import { getDefaultSize } from "metabase/visualizations";

import type {
  DashboardCard,
  DashboardId,
  DashboardTabId,
} from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";
import {
  DEFAULT_CARD_SIZE,
  getPositionForNewDashCard,
} from "metabase/lib/dashboard_grid";

import { ADD_CARD_TO_DASH } from "./core";
import { getExistingDashCards } from "./utils";

type NewDashCardOpts = {
  dashId: DashboardId;
  tabId: DashboardTabId | null;
};

type AddDashCardOpts = NewDashCardOpts & {
  dashcardOverrides: Partial<DashboardCard>;
};

export const addDashCardToDashboard =
  ({ dashId, tabId, dashcardOverrides }: AddDashCardOpts) =>
  (dispatch: Dispatch, getState: GetState) => {
    const display = dashcardOverrides?.card?.display;
    const dashCardSize = display
      ? getDefaultSize(display) || DEFAULT_CARD_SIZE
      : DEFAULT_CARD_SIZE;

    const dashboardState = getState().dashboard;
    const dashcards = getExistingDashCards(
      dashboardState.dashboards,
      dashboardState.dashcards,
      dashId,
      tabId,
    );
    const position = getPositionForNewDashCard(
      dashcards,
      dashCardSize.width,
      dashCardSize.height,
    );

    const dashcard = {
      id: generateTemporaryDashcardId(),

      dashboard_id: dashId,
      dashboard_tab_id: tabId ?? null,

      card_id: null,
      card: null,

      series: [],
      parameter_mappings: [],
      visualization_settings: {},

      ...position,
      ...dashcardOverrides,
    };

    dispatch(createAction(ADD_CARD_TO_DASH)(dashcard));
  };

let tempId = -1;

function generateTemporaryDashcardId() {
  return tempId--;
}
