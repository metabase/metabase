import _ from "underscore";
import { t } from "ttag";

import { createAction } from "metabase/lib/redux";

import Questions from "metabase/entities/questions";

import {
  getPositionForNewDashCard,
  DEFAULT_CARD_SIZE,
} from "metabase/lib/dashboard_grid";
import { createCard } from "metabase/lib/card";

import { getVisualizationRaw } from "metabase/visualizations";
import { ADD_CARD_TO_DASH } from "./core";
import { fetchCardData } from "./data-fetching";
import { loadMetadataForDashboard } from "./metadata";

export const MARK_NEW_CARD_SEEN = "metabase/dashboard/MARK_NEW_CARD_SEEN";
export const markNewCardSeen = createAction(MARK_NEW_CARD_SEEN);

function generateTemporaryDashcardId() {
  return Math.random();
}

export const addCardToDashboard =
  ({ dashId, cardId }) =>
  async (dispatch, getState) => {
    await dispatch(Questions.actions.fetch({ id: cardId }));
    const card = Questions.selectors.getObject(getState(), {
      entityId: cardId,
    });
    const { dashboards, dashcards } = getState().dashboard;
    const dashboard = dashboards[dashId];
    const existingCards = dashboard.ordered_cards
      .map(id => dashcards[id])
      .filter(dc => !dc.isRemoved);
    const { visualization } = getVisualizationRaw([{ card }]);
    const createdCardSize = visualization.minSize || DEFAULT_CARD_SIZE;
    const dashcard = {
      id: generateTemporaryDashcardId(),
      dashboard_id: dashId,
      card_id: card.id,
      card: card,
      series: [],
      ...getPositionForNewDashCard(
        existingCards,
        createdCardSize.width,
        createdCardSize.height,
      ),
      parameter_mappings: [],
      visualization_settings: {},
    };
    dispatch(createAction(ADD_CARD_TO_DASH)(dashcard));
    dispatch(fetchCardData(card, dashcard, { reload: true, clear: true }));

    dispatch(loadMetadataForDashboard([dashcard]));
  };

export const addDashCardToDashboard = function ({ dashId, dashcardOverrides }) {
  return function (dispatch, getState) {
    const { dashboards, dashcards } = getState().dashboard;
    const dashboard = dashboards[dashId];
    const existingCards = dashboard.ordered_cards
      .map(id => dashcards[id])
      .filter(dc => !dc.isRemoved);
    const dashcard = {
      id: generateTemporaryDashcardId(),
      card_id: null,
      card: null,
      dashboard_id: dashId,
      series: [],
      ...getPositionForNewDashCard(existingCards),
      parameter_mappings: [],
      visualization_settings: {},
    };
    _.extend(dashcard, dashcardOverrides);
    dispatch(createAction(ADD_CARD_TO_DASH)(dashcard));
  };
};

export const addTextDashCardToDashboard = function ({ dashId }) {
  const virtualTextCard = createCard();
  virtualTextCard.display = "text";
  virtualTextCard.archived = false;

  const dashcardOverrides = {
    card: virtualTextCard,
    visualization_settings: {
      virtual_card: virtualTextCard,
    },
  };
  return addDashCardToDashboard({
    dashId: dashId,
    dashcardOverrides: dashcardOverrides,
  });
};

const esitmateCardSize = (displayType, action) => {
  const BASE_HEIGHT = 3;
  const HEIGHT_PER_FIELD = 1.5;

  if (displayType === "button") {
    return { size_x: 2, size_y: 1 };
  }

  return {
    size_x: 6,
    size_y: Math.round(
      BASE_HEIGHT + action.parameters.length * HEIGHT_PER_FIELD,
    ),
  };
};

export const addActionToDashboard =
  async ({ dashId, action, displayType }) =>
  dispatch => {
    const virtualActionsCard = {
      ...createCard(),
      display: "action",
      archived: false,
    };

    const dashcardOverrides = {
      action,
      card_id: action.model_id,
      card: virtualActionsCard,
      ...esitmateCardSize(displayType, action),
      visualization_settings: {
        actionDisplayType: displayType ?? "button",
        virtual_card: virtualActionsCard,
        "button.label": action.name ?? action.id,
        action_slug: action.slug,
      },
    };
    dispatch(
      addDashCardToDashboard({
        dashId: dashId,
        dashcardOverrides: dashcardOverrides,
      }),
    );
  };

export const addLinkToDashboard =
  async ({ dashId, clickBehavior }) =>
  dispatch => {
    const virtualActionsCard = {
      ...createCard(),
      display: "action",
      archived: false,
    };
    const dashcardOverrides = {
      card: virtualActionsCard,
      size_x: 2,
      size_y: 1,
      visualization_settings: {
        virtual_card: virtualActionsCard,
        "button.label": t`Link`,
        click_behavior: clickBehavior,
        actionDisplayType: "button",
      },
    };
    dispatch(
      addDashCardToDashboard({
        dashId: dashId,
        dashcardOverrides: dashcardOverrides,
      }),
    );
  };
