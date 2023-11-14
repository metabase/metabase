import _ from "underscore";
import { t } from "ttag";
import { createAction, createThunkAction } from "metabase/lib/redux";

import Questions from "metabase/entities/questions";

import {
  getPositionForNewDashCard,
  DEFAULT_CARD_SIZE,
} from "metabase/lib/dashboard_grid";
import { createCard } from "metabase/lib/card";

import { getVisualizationRaw } from "metabase/visualizations";
import { trackCardCreated } from "../analytics";
import { getDashCardById } from "../selectors";
import { isVirtualDashCard } from "../utils";
import {
  ADD_CARD_TO_DASH,
  REMOVE_CARD_FROM_DASH,
  UNDO_REMOVE_CARD_FROM_DASH,
} from "./core";
import { cancelFetchCardData, fetchCardData } from "./data-fetching";
import { loadMetadataForDashboard } from "./metadata";

export const MARK_NEW_CARD_SEEN = "metabase/dashboard/MARK_NEW_CARD_SEEN";
export const markNewCardSeen = createAction(MARK_NEW_CARD_SEEN);

let tempId = -1;
function generateTemporaryDashcardId() {
  return tempId--;
}

function getExistingDashCards(state, dashId, tabId) {
  const { dashboards, dashcards } = state.dashboard;
  const dashboard = dashboards[dashId];
  return dashboard.ordered_cards
    .map(id => dashcards[id])
    .filter(dc => {
      if (dc.isRemoved) {
        return false;
      }
      if (tabId != null) {
        return dc.dashboard_tab_id === tabId;
      }
      return true;
    });
}

export const addCardToDashboard =
  ({ dashId, cardId, tabId }) =>
  async (dispatch, getState) => {
    await dispatch(Questions.actions.fetch({ id: cardId }));
    const card = Questions.selectors
      .getObject(getState(), { entityId: cardId })
      .card();
    const { visualization } = getVisualizationRaw([{ card }]);
    const createdCardSize = visualization.defaultSize || DEFAULT_CARD_SIZE;

    const dashcard = {
      id: generateTemporaryDashcardId(),
      dashboard_id: dashId,
      dashboard_tab_id: tabId ?? null,
      card_id: card.id,
      card: card,
      series: [],
      ...getPositionForNewDashCard(
        getExistingDashCards(getState(), dashId, tabId),
        createdCardSize.width,
        createdCardSize.height,
      ),
      parameter_mappings: [],
      visualization_settings: {},
    };
    dispatch(createAction(ADD_CARD_TO_DASH)(dashcard));
    dispatch(fetchCardData(card, dashcard, { reload: true, clearCache: true }));

    dispatch(loadMetadataForDashboard([dashcard]));
  };

export const removeCardFromDashboard = createThunkAction(
  REMOVE_CARD_FROM_DASH,
  ({ dashcardId, cardId }) =>
    (dispatch, _getState) => {
      dispatch(cancelFetchCardData(cardId, dashcardId));
      return { dashcardId };
    },
);

export const undoRemoveCardFromDashboard = createThunkAction(
  UNDO_REMOVE_CARD_FROM_DASH,
  ({ dashcardId }) =>
    (dispatch, getState) => {
      const dashcard = getDashCardById(getState(), dashcardId);
      const card = dashcard.card;

      if (!isVirtualDashCard(dashcard)) {
        dispatch(fetchCardData(card, dashcard));
      }

      return { dashcardId };
    },
);

export const addDashCardToDashboard = function ({
  dashId,
  dashcardOverrides,
  tabId,
}) {
  return function (dispatch, getState) {
    const { visualization } = getVisualizationRaw([dashcardOverrides]);
    const createdCardSize = visualization.defaultSize || DEFAULT_CARD_SIZE;

    const dashcard = {
      id: generateTemporaryDashcardId(),
      card_id: null,
      card: null,
      dashboard_id: dashId,
      dashboard_tab_id: tabId ?? null,
      series: [],
      ...getPositionForNewDashCard(
        getExistingDashCards(getState(), dashId, tabId),
        createdCardSize.width,
        createdCardSize.height,
      ),
      parameter_mappings: [],
      visualization_settings: {},
    };
    _.extend(dashcard, dashcardOverrides);
    dispatch(createAction(ADD_CARD_TO_DASH)(dashcard));
  };
};

export const addMarkdownDashCardToDashboard = function ({ dashId, tabId }) {
  trackCardCreated("text", dashId);

  const virtualTextCard = {
    ...createCard(),
    display: "text",
    archived: false,
  };

  const dashcardOverrides = {
    card: virtualTextCard,
    visualization_settings: {
      virtual_card: virtualTextCard,
    },
  };
  return addDashCardToDashboard({
    dashId: dashId,
    dashcardOverrides: dashcardOverrides,
    tabId,
  });
};

export const addHeadingDashCardToDashboard = function ({ dashId, tabId }) {
  trackCardCreated("heading", dashId);

  const virtualTextCard = {
    ...createCard(),
    display: "heading",
    archived: false,
  };

  const dashcardOverrides = {
    card: virtualTextCard,
    visualization_settings: {
      virtual_card: virtualTextCard,
      "dashcard.background": false,
    },
  };
  return addDashCardToDashboard({
    dashId: dashId,
    dashcardOverrides: dashcardOverrides,
    tabId,
  });
};

export const addLinkDashCardToDashboard = function ({ dashId, tabId }) {
  trackCardCreated("link", dashId);

  const virtualLinkCard = {
    ...createCard(),
    display: "link",
    archived: false,
  };

  const dashcardOverrides = {
    card: virtualLinkCard,
    visualization_settings: {
      virtual_card: virtualLinkCard,
    },
  };
  return addDashCardToDashboard({
    dashId: dashId,
    dashcardOverrides: dashcardOverrides,
    tabId,
  });
};

export const addActionToDashboard =
  async ({ dashId, tabId, action, displayType }) =>
  dispatch => {
    trackCardCreated("action", dashId);

    const virtualActionsCard = {
      ...createCard(),
      id: action.model_id,
      display: "action",
      archived: false,
    };

    const buttonLabel = action.name ?? action.id ?? t`Click Me`;

    const dashcardOverrides = {
      action: action.id ? action : null,
      action_id: action.id,
      card_id: action.model_id,
      card: virtualActionsCard,
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
        tabId,
      }),
    );
  };
