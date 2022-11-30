import _ from "underscore";
import { t } from "ttag";

import { createAction } from "metabase/lib/redux";
import { measureText } from "metabase/lib/measure-text";

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

const estimateCardSize = (displayType, action, buttonLabel) => {
  const BASE_HEIGHT = 3;
  const HEIGHT_PER_FIELD = 1.5;

  const PIXELS_PER_BLOCK = 49;
  const MAX_BUTTON_BLOCK_WIDTH = 18;

  if (displayType === "button") {
    const textWidth = measureText(buttonLabel, {
      family: "Lato",
      size: 14,
      weight: 700,
    });

    return {
      size_x: Math.min(
        Math.ceil((textWidth + PIXELS_PER_BLOCK) / PIXELS_PER_BLOCK),
        MAX_BUTTON_BLOCK_WIDTH,
      ),
      size_y: 1,
    };
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
      id: action.model_id,
      display: "action",
      archived: false,
    };

    const buttonLabel = action.name ?? action.id;

    const dashcardOverrides = {
      action,
      action_id: action.id,
      card_id: action.model_id,
      card: virtualActionsCard,
      ...estimateCardSize(displayType, action, buttonLabel),
      visualization_settings: {
        actionDisplayType: displayType ?? "button",
        virtual_card: virtualActionsCard,
        "button.label": buttonLabel,
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
