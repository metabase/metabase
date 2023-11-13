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
import { autoWireParametersToNewCard } from "metabase/dashboard/actions/auto-wire-parameters/actions";
import { getParameterMappings } from "metabase/dashboard/actions/auto-wire-parameters/utils";
import { addUndo } from "metabase/redux/undo";
import { getMetadata } from "metabase/selectors/metadata";
import { compareMappingOptionTargets } from "metabase-lib/parameters/utils/targets";
import { trackCardCreated } from "../analytics";
import { getDashCardById, getParameterMappingOptions } from "../selectors";
import {
  ADD_CARD_TO_DASH,
  REMOVE_CARD_FROM_DASH,
  setDashCardAttributes,
  UNDO_REMOVE_CARD_FROM_DASH,
} from "./core";
import { cancelFetchCardData, fetchCardData } from "./data-fetching";
import { loadMetadataForDashboard } from "./metadata";
import { getExistingDashCards } from "./utils";

export const MARK_NEW_CARD_SEEN = "metabase/dashboard/MARK_NEW_CARD_SEEN";
export const markNewCardSeen = createAction(MARK_NEW_CARD_SEEN);

let tempId = -1;

function generateTemporaryDashcardId() {
  return tempId--;
}

export const addCardToDashboard =
  ({ dashId, cardId, tabId }) =>
  async (dispatch, getState) => {
    await dispatch(Questions.actions.fetch({ id: cardId }));
    const card = Questions.selectors
      .getObject(getState(), { entityId: cardId })
      .card();
    const visualization = getVisualizationRaw([{ card }]);
    const createdCardSize = visualization.defaultSize || DEFAULT_CARD_SIZE;

    const dashboardState = getState().dashboard;

    const dashcardId = generateTemporaryDashcardId();
    const dashcard = {
      id: dashcardId,
      dashboard_id: dashId,
      dashboard_tab_id: tabId ?? null,
      card_id: card.id,
      card: card,
      series: [],
      ...getPositionForNewDashCard(
        getExistingDashCards(
          dashboardState.dashboards,
          dashboardState.dashcards,
          dashId,
          tabId,
        ),
        createdCardSize.width,
        createdCardSize.height,
      ),
      parameter_mappings: [],
      visualization_settings: {},
    };
    dispatch(createAction(ADD_CARD_TO_DASH)(dashcard));
    dispatch(fetchCardData(card, dashcard, { reload: true, clearCache: true }));

    dispatch(loadMetadataForDashboard([dashcard]));

    dispatch(
      autoWireParametersToNewCard({
        dashboard_id: dashId,
        dashcard_id: dashcardId,
      }),
    );
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

      dispatch(fetchCardData(card, dashcard));

      return { dashcardId };
    },
);

export const addDashCardToDashboard = function ({
  dashId,
  dashcardOverrides,
  tabId,
}) {
  return function (dispatch, getState) {
    const visualization = getVisualizationRaw([dashcardOverrides]);
    const createdCardSize = visualization.defaultSize || DEFAULT_CARD_SIZE;

    const dashboardState = getState().dashboard;

    const dashcard = {
      id: generateTemporaryDashcardId(),
      card_id: null,
      card: null,
      dashboard_id: dashId,
      dashboard_tab_id: tabId ?? null,
      series: [],
      ...getPositionForNewDashCard(
        getExistingDashCards(
          dashboardState.dashboards,
          dashboardState.dashcards,
          dashId,
          tabId,
        ),
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

export const autoApplyParametersToNewCard =
  ({ dashcard_id }) =>
  async (dispatch, getState) => {
    const metadata = getMetadata(getState());
    const dashboardState = getState().dashboard;
    const dashboardId = dashboardState.dashboardId;
    const dashcards = getExistingDashCards(dashboardState, dashboardId);

    const targetDashcard = getDashCardById(getState(), dashcard_id);
    const dashcardMappingOptions = getParameterMappingOptions(
      metadata,
      null,
      targetDashcard.card,
      targetDashcard,
    );

    const parametersToAutoApply = [];
    const processedParameterIds = new Set();

    for (const opt of dashcardMappingOptions) {
      for (const dashcard of dashcards) {
        const param = dashcard.parameter_mappings.find(param =>
          compareMappingOptionTargets(
            param.target,
            opt.target,
            dashcard,
            targetDashcard,
            metadata,
          ),
        );

        if (param && !processedParameterIds.has(param.parameter_id)) {
          parametersToAutoApply.push(
            ...getParameterMappings(
              targetDashcard,
              param.parameter_id,
              targetDashcard.card_id,
              param.target,
            ),
          );
          processedParameterIds.add(param.parameter_id);
        }
      }
    }

    if (parametersToAutoApply.length > 0) {
      dispatch(
        setDashCardAttributes({
          id: dashcard_id,
          attributes: {
            parameter_mappings: parametersToAutoApply,
          },
        }),
      );

      dispatch(
        addUndo({
          action: setDashCardAttributes({
            id: dashcard_id,
            attributes: {
              parameter_mappings: [],
            },
          }),
          message: t`${targetDashcard.card.name} has been auto-connected with existing filters.`,
          actionLabel: "Undo auto-connection",
        }),
      );
    }
  };
