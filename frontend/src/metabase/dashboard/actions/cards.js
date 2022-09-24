import _ from "underscore";

import { createAction } from "metabase/lib/redux";

import Questions from "metabase/entities/questions";

import { getPositionForNewDashCard } from "metabase/lib/dashboard_grid";
import { createCard } from "metabase/lib/card";

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
    const dashcard = {
      id: generateTemporaryDashcardId(),
      dashboard_id: dashId,
      card_id: card.id,
      card: card,
      series: [],
      ...getPositionForNewDashCard(existingCards),
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

export const addActionDashCardToDashboard = ({ dashId }) => {
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
    },
  };
  return addDashCardToDashboard({
    dashId: dashId,
    dashcardOverrides: dashcardOverrides,
  });
};
