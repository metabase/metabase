import { createAction } from "metabase/lib/redux";
import Questions from "metabase/entities/questions";
import { getDefaultSize } from "metabase/visualizations";

import type {
  CardId,
  DashboardCard,
  DashboardId,
  DashboardTabId,
} from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";
import {
  DEFAULT_CARD_SIZE,
  getPositionForNewDashCard,
} from "metabase/lib/dashboard_grid";

import { autoWireParametersToNewCard } from "./auto-wire-parameters/actions";
import { ADD_CARD_TO_DASH } from "./core";
import { fetchCardData } from "./data-fetching";
import { loadMetadataForDashboard } from "./metadata";
import { getExistingDashCards } from "./utils";

type NewDashCardOpts = {
  dashId: DashboardId;
  tabId: DashboardTabId | null;
};

type AddDashCardOpts = NewDashCardOpts & {
  dashcardOverrides: Partial<DashboardCard>;
};

let tempId = -1;

export function generateTemporaryDashcardId() {
  return tempId--;
}

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

    return dashcard;
  };

type AddCardToDashboardOpts = NewDashCardOpts & {
  cardId: CardId;
};

export const addCardToDashboard =
  ({ dashId, tabId, cardId }: AddCardToDashboardOpts) =>
  async (dispatch: Dispatch, getState: GetState) => {
    await dispatch(Questions.actions.fetch({ id: cardId }));
    const card = Questions.selectors
      .getObject(getState(), { entityId: cardId })
      .card();

    const dashcardId = generateTemporaryDashcardId();
    const dashcard = dispatch(
      addDashCardToDashboard({
        dashId,
        tabId,
        dashcardOverrides: { id: dashcardId, card, card_id: cardId },
      }),
    );

    dispatch(fetchCardData(card, dashcard, { reload: true, clearCache: true }));
    await dispatch(loadMetadataForDashboard([dashcard]));
    dispatch(autoWireParametersToNewCard({ dashcard_id: dashcardId }));
  };
