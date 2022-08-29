import { assocIn, dissocIn, getIn } from "icepick";
import _ from "underscore";

import { createAction, createThunkAction } from "metabase/lib/redux";

import Actions from "metabase/entities/actions";
import Dashboards from "metabase/entities/dashboards";
import Questions from "metabase/entities/questions";

import { SIDEBAR_NAME } from "metabase/dashboard/constants";

import { getPositionForNewDashCard } from "metabase/lib/dashboard_grid";
import { clickBehaviorIsValid } from "metabase/lib/click-behavior";
import { createCard } from "metabase/lib/card";

import { DashboardApi, CardApi, EmittersApi } from "metabase/services";

import { getDashboardBeforeEditing } from "../selectors";
import {
  isActionButtonDashCard,
  getActionButtonActionId,
  getActionButtonEmitterId,
  getActionEmitterParameterMappings,
} from "metabase/writeback/utils";

import { ADD_CARD_TO_DASH, updateDashcardId } from "./core";
import {
  fetchDashboard,
  fetchDashboardCardData,
  fetchCardData,
} from "./data-fetching";
import { loadMetadataForDashboard } from "./metadata";
import { setSidebar, closeSidebar } from "./ui";

// action constants

export const INITIALIZE = "metabase/dashboard/INITIALIZE";
export const RESET = "metabase/dashboard/RESET";

export const SET_EDITING_DASHBOARD = "metabase/dashboard/SET_EDITING_DASHBOARD";

export const SAVE_DASHBOARD_AND_CARDS =
  "metabase/dashboard/SAVE_DASHBOARD_AND_CARDS";

export const MARK_NEW_CARD_SEEN = "metabase/dashboard/MARK_NEW_CARD_SEEN";

export const initialize = createAction(INITIALIZE);
export const reset = createAction(RESET);
export const setEditingDashboard = createAction(SET_EDITING_DASHBOARD);

export const showClickBehaviorSidebar = dashcardId => dispatch => {
  if (dashcardId != null) {
    dispatch(
      setSidebar({
        name: SIDEBAR_NAME.clickBehavior,
        props: { dashcardId },
      }),
    );
  } else {
    dispatch(closeSidebar());
  }
};

export const openAddQuestionSidebar = () => dispatch => {
  dispatch(
    setSidebar({
      name: SIDEBAR_NAME.addQuestion,
    }),
  );
};

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

export const addActionButtonDashCardToDashboard = ({ dashId }) => {
  const virtualActionsCard = {
    ...createCard(),
    display: "action-button",
    archived: false,
  };
  const dashcardOverrides = {
    card: virtualActionsCard,
    sizeX: 2,
    sizeY: 1,
    visualization_settings: {
      virtual_card: virtualActionsCard,
    },
  };
  return addDashCardToDashboard({
    dashId: dashId,
    dashcardOverrides: dashcardOverrides,
  });
};

export const saveDashboardAndCards = createThunkAction(
  SAVE_DASHBOARD_AND_CARDS,
  function () {
    return async function (dispatch, getState) {
      const state = getState();
      const { dashboards, dashcards, dashboardId } = state.dashboard;
      const dashboard = {
        ...dashboards[dashboardId],
        ordered_cards: dashboards[dashboardId].ordered_cards.map(
          dashcardId => dashcards[dashcardId],
        ),
      };

      // clean invalid dashcards
      // We currently only do this for dashcard click behavior.
      // Invalid (partially complete) states are fine during editing,
      // but we should restore the previous value if saved while invalid.
      const dashboardBeforeEditing = getDashboardBeforeEditing(state);
      const clickBehaviorPath = ["visualization_settings", "click_behavior"];
      dashboard.ordered_cards = dashboard.ordered_cards.map((card, index) => {
        if (!clickBehaviorIsValid(getIn(card, clickBehaviorPath))) {
          const startingValue = getIn(dashboardBeforeEditing, [
            "ordered_cards",
            index,
            ...clickBehaviorPath,
          ]);
          return startingValue == null
            ? dissocIn(card, clickBehaviorPath)
            : assocIn(card, clickBehaviorPath, startingValue);
        }
        return card;
      });

      // remove isRemoved dashboards
      await Promise.all(
        dashboard.ordered_cards
          .filter(dc => dc.isRemoved && !dc.isAdded)
          .map(dc => {
            if (isActionButtonDashCard(dc) && !!getActionButtonEmitterId(dc)) {
              const emitterId = getActionButtonEmitterId(dc);
              return EmittersApi.delete({ id: emitterId }).then(() =>
                DashboardApi.removecard({
                  dashId: dashboard.id,
                  dashcardId: dc.id,
                }),
              );
            }
            return DashboardApi.removecard({
              dashId: dashboard.id,
              dashcardId: dc.id,
            });
          }),
      );

      // add isAdded dashboards
      const updatedDashcards = await Promise.all(
        dashboard.ordered_cards
          .filter(dc => !dc.isRemoved)
          .map(async dc => {
            if (dc.isAdded) {
              if (isActionButtonDashCard(dc) && !!getActionButtonActionId(dc)) {
                const actionId = getActionButtonActionId(dc);
                const action = Actions.selectors.getObject(getState(), {
                  entityId: actionId,
                });
                const emitter = await EmittersApi.create({
                  dashboard_id: dashboard.id,
                  action_id: actionId,
                  parameter_mappings: getActionEmitterParameterMappings(action),
                });
                dc.visualization_settings.click_behavior.emitter_id =
                  emitter.id;
              }

              const result = await DashboardApi.addcard({
                dashId: dashboard.id,
                cardId: dc.card_id,
              });
              dispatch(updateDashcardId(dc.id, result.id));

              // mark isAdded because addcard doesn't record the position
              return {
                ...result,
                col: dc.col,
                row: dc.row,
                sizeX: dc.sizeX,
                sizeY: dc.sizeY,
                series: dc.series,
                parameter_mappings: dc.parameter_mappings,
                visualization_settings: dc.visualization_settings,
                isAdded: true,
              };
            } else {
              return dc;
            }
          }),
      );

      // update modified cards
      await Promise.all(
        dashboard.ordered_cards
          .filter(dc => dc.card.isDirty)
          .map(async dc => CardApi.update(dc.card)),
      );

      // update the dashboard itself
      if (dashboard.isDirty) {
        const { id, name, description, parameters } = dashboard;
        await dispatch(
          Dashboards.actions.update({ id }, { name, description, parameters }),
        );
      }

      // reposition the cards
      if (_.some(updatedDashcards, dc => dc.isDirty || dc.isAdded)) {
        const cards = updatedDashcards.map(
          ({
            id,
            card_id,
            row,
            col,
            sizeX,
            sizeY,
            series,
            parameter_mappings,
            visualization_settings,
          }) => ({
            id,
            card_id,
            row,
            col,
            sizeX,
            sizeY,
            series,
            visualization_settings,
            parameter_mappings:
              parameter_mappings &&
              parameter_mappings.filter(
                mapping =>
                  // filter out mappings for deleted parameters
                  _.findWhere(dashboard.parameters, {
                    id: mapping.parameter_id,
                  }) &&
                  // filter out mappings for deleted series
                  (!card_id ||
                    card_id === mapping.card_id ||
                    _.findWhere(series, { id: mapping.card_id })),
              ),
          }),
        );

        const result = await DashboardApi.reposition_cards({
          dashId: dashboard.id,
          cards,
        });
        if (result.status !== "ok") {
          throw new Error(result.status);
        }
      }

      await dispatch(Dashboards.actions.update(dashboard));

      // make sure that we've fully cleared out any dirty state from editing (this is overkill, but simple)
      dispatch(fetchDashboard(dashboard.id, null)); // disable using query parameters when saving
    };
  },
);

export const REVERT_TO_REVISION = "metabase/dashboard/REVERT_TO_REVISION";
export const revertToRevision = createThunkAction(
  REVERT_TO_REVISION,
  revision => {
    return async dispatch => {
      await revision.revert();
      await dispatch(fetchDashboard(revision.model_id, null));
      await dispatch(fetchDashboardCardData({ reload: false, clear: true }));
    };
  },
);
