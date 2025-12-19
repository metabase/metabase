import { assoc, assocIn, chain, dissoc, merge, updateIn } from "icepick";
import _ from "underscore";

import { Actions } from "metabase/entities/actions";
import { Questions } from "metabase/entities/questions";
import { combineReducers, handleActions } from "metabase/lib/redux";

import {
  ADD_CARD_TO_DASH,
  ADD_MANY_CARDS_TO_DASH,
  INITIALIZE,
  MARK_NEW_CARD_SEEN,
  REMOVE_CARD_FROM_DASH,
  REMOVE_PARAMETER,
  REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS,
  RESET_PARAMETERS,
  SET_DASHCARD_ATTRIBUTES,
  SET_MULTIPLE_DASHCARD_ATTRIBUTES,
  SET_PARAMETER_VALUE,
  SET_PARAMETER_VALUES,
  UNDO_REMOVE_CARD_FROM_DASH,
  UPDATE_DASHCARD_VISUALIZATION_SETTINGS,
  UPDATE_DASHCARD_VISUALIZATION_SETTINGS_FOR_COLUMN,
  fetchDashboard,
  tabsReducer,
} from "./actions";
import { INITIAL_DASHBOARD_STATE } from "./constants";
import {
  autoApplyFilters,
  dashboardId,
  dashboards,
  dashcardData,
  editingDashboard,
  isAddParameterPopoverOpen,
  isNavigatingBackToDashboard,
  loadingControls,
  loadingDashCards,
  missingActionParameters,
  parameterValues,
  sidebar,
  slowCards,
} from "./reducers-typed";
import { calculateDashCardRowAfterUndo } from "./utils";

const dashcards = handleActions(
  {
    [fetchDashboard.fulfilled]: {
      next: (state, { payload }) => ({
        ...state,
        ...payload.entities.dashcard,
      }),
    },
    [SET_DASHCARD_ATTRIBUTES]: {
      next: (state, { payload: { id, attributes } }) => ({
        ...state,
        [id]: { ...state[id], ...attributes, isDirty: true },
      }),
    },
    [SET_MULTIPLE_DASHCARD_ATTRIBUTES]: {
      next: (state, { payload: { dashcards } }) => {
        const nextState = { ...state };
        dashcards.forEach(({ id, attributes }) => {
          nextState[id] = {
            ...state[id],
            ...attributes,
            isDirty: true,
          };
        });
        return nextState;
      },
    },
    [UPDATE_DASHCARD_VISUALIZATION_SETTINGS]: {
      next: (state, { payload: { id, settings } }) =>
        chain(state)
          .updateIn([id, "visualization_settings"], (value = {}) => ({
            ...value,
            ...settings,
          }))
          .assocIn([id, "isDirty"], true)
          .value(),
    },
    [UPDATE_DASHCARD_VISUALIZATION_SETTINGS_FOR_COLUMN]: {
      next: (state, { payload: { column, id, settings } }) =>
        chain(state)
          .updateIn([id, "visualization_settings"], (value = {}) =>
            updateIn(
              merge({ column_settings: {} }, value),
              ["column_settings", column],
              (columnSettings) => ({
                ...columnSettings,
                ...settings,
              }),
            ),
          )
          .assocIn([id, "isDirty"], true)
          .value(),
    },
    [REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS]: {
      next: (state, { payload: { id, settings } }) =>
        chain(state)
          .assocIn([id, "visualization_settings"], settings)
          .assocIn([id, "isDirty"], true)
          .value(),
    },
    [ADD_CARD_TO_DASH]: (state, { payload: dashcard }) => ({
      ...state,
      [dashcard.id]: { ...dashcard, isAdded: true, justAdded: true },
    }),
    [ADD_MANY_CARDS_TO_DASH]: (state, { payload: dashcards }) => {
      const storeDashcards = dashcards.map((dc, index) => ({
        ...dc,
        isAdded: true,
        justAdded: index === 0,
      }));
      const storeDashCardsMap = _.indexBy(storeDashcards, "id");
      return {
        ...state,
        ...storeDashCardsMap,
      };
    },
    [REMOVE_CARD_FROM_DASH]: (state, { payload: { dashcardId } }) => ({
      ...state,
      [dashcardId]: { ...state[dashcardId], isRemoved: true },
    }),
    [UNDO_REMOVE_CARD_FROM_DASH]: (state, { payload: { dashcardId } }) => ({
      ...state,
      [dashcardId]: {
        ...state[dashcardId],
        isRemoved: false,
        row: calculateDashCardRowAfterUndo(state[dashcardId].row),
      },
    }),
    [MARK_NEW_CARD_SEEN]: (state, { payload: dashcardId }) => ({
      ...state,
      [dashcardId]: { ...state[dashcardId], justAdded: false },
    }),
    [Questions.actionTypes.UPDATE]: (state, { payload: { object: card } }) =>
      _.mapObject(state, (dashcard) =>
        dashcard.card?.id === card?.id
          ? assocIn(dashcard, ["card"], card)
          : dashcard,
      ),
    [Actions.actionTypes.UPDATE]: (state, { payload: { object: action } }) =>
      _.mapObject(state, (dashcard) =>
        dashcard.action?.id === action?.id
          ? {
              ...dashcard,
              action: {
                ...action,

                database_enabled_actions:
                  dashcard?.action.database_enabled_actions || false,
              },
            }
          : dashcard,
      ),
  },
  INITIAL_DASHBOARD_STATE.dashcards,
);

const draftParameterValues = handleActions(
  {
    [INITIALIZE]: {
      next: (state, { payload: { clearCache = true } = {} }) => {
        return clearCache ? {} : state;
      },
    },
    [fetchDashboard.fulfilled]: {
      next: (
        state,
        { payload: { dashboard, parameterValues, preserveParameters } },
      ) =>
        preserveParameters && !dashboard.auto_apply_filters
          ? state
          : parameterValues,
    },
    [SET_PARAMETER_VALUE]: {
      next: (state, { payload: { id, value } }) =>
        assoc(state ?? {}, id, value),
    },
    [SET_PARAMETER_VALUES]: {
      next: (state, { payload }) => payload,
    },
    [RESET_PARAMETERS]: {
      next: (state, { payload: parameters }) => {
        return parameters.reduce(
          (result, parameter) => assoc(result, parameter.id, parameter.value),
          state ?? {},
        );
      },
    },
    [REMOVE_PARAMETER]: {
      next: (state, { payload: { id } }) => dissoc(state, id),
    },
  },
  {},
);

const combinedDashboardReducer = combineReducers({
  dashboardId,
  missingActionParameters,
  autoApplyFilters,
  slowCards,
  isNavigatingBackToDashboard,
  isAddParameterPopoverOpen,
  editingDashboard,
  loadingControls,
  sidebar,
  parameterValues,
  dashboards,
  loadingDashCards,
  dashcards,
  dashcardData,
  draftParameterValues,
  // Combined reducer needs to init state for every slice
  selectedTabId: (state = INITIAL_DASHBOARD_STATE.selectedTabId) => state,
  tabDeletions: (state = INITIAL_DASHBOARD_STATE.tabDeletions) => state,
});

export const dashboardReducers = (state = INITIAL_DASHBOARD_STATE, action) =>
  tabsReducer(combinedDashboardReducer(state, action), action);
