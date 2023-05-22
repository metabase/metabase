import { assoc, dissoc, assocIn, updateIn, chain, merge } from "icepick";
import reduceReducers from "reduce-reducers";

import { handleActions, combineReducers } from "metabase/lib/redux";
import Dashboards from "metabase/entities/dashboards";

import { NAVIGATE_TO_DASHBOARD } from "metabase/query_builder/actions";

import {
  INITIALIZE,
  FETCH_DASHBOARD,
  SET_EDITING_DASHBOARD,
  SET_DASHBOARD_ATTRIBUTES,
  ADD_CARD_TO_DASH,
  CREATE_PUBLIC_LINK,
  DELETE_PUBLIC_LINK,
  UPDATE_EMBEDDING_PARAMS,
  UPDATE_ENABLE_EMBEDDING,
  SET_DASHCARD_ATTRIBUTES,
  SET_MULTIPLE_DASHCARD_ATTRIBUTES,
  UPDATE_DASHCARD_VISUALIZATION_SETTINGS,
  UPDATE_DASHCARD_VISUALIZATION_SETTINGS_FOR_COLUMN,
  REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS,
  REMOVE_CARD_FROM_DASH,
  MARK_NEW_CARD_SEEN,
  REMOVE_PARAMETER,
  FETCH_CARD_DATA,
  CLEAR_CARD_DATA,
  MARK_CARD_AS_SLOW,
  SET_PARAMETER_VALUE,
  FETCH_DASHBOARD_CARD_DATA,
  CANCEL_FETCH_CARD_DATA,
  SHOW_ADD_PARAMETER_POPOVER,
  HIDE_ADD_PARAMETER_POPOVER,
  SET_SIDEBAR,
  CLOSE_SIDEBAR,
  SET_DOCUMENT_TITLE,
  SET_SHOW_LOADING_COMPLETE_FAVICON,
  RESET,
  SET_PARAMETER_VALUES,
  UNDO_REMOVE_CARD_FROM_DASH,
  SHOW_AUTO_APPLY_FILTERS_TOAST,
  tabsReducer,
  NAVIGATE_TO_NEW_CARD,
} from "./actions";
import { isVirtualDashCard, syncParametersAndEmbeddingParams } from "./utils";
import { INITIAL_DASHBOARD_STATE } from "./constants";

const dashboardId = handleActions(
  {
    [INITIALIZE]: { next: state => null },
    [FETCH_DASHBOARD]: {
      next: (state, { payload: { dashboardId } }) => dashboardId,
    },
    [RESET]: { next: state => null },
  },
  INITIAL_DASHBOARD_STATE.dashboardId,
);

const isEditing = handleActions(
  {
    [INITIALIZE]: { next: state => null },
    [SET_EDITING_DASHBOARD]: {
      next: (state, { payload }) => (payload ? payload : null),
    },
    [RESET]: { next: state => null },
  },
  INITIAL_DASHBOARD_STATE.isEditing,
);

const loadingControls = handleActions(
  {
    [SET_DOCUMENT_TITLE]: (state, { payload }) => ({
      ...state,
      documentTitle: payload,
    }),
    [SET_SHOW_LOADING_COMPLETE_FAVICON]: (state, { payload }) => ({
      ...state,
      showLoadCompleteFavicon: payload,
    }),
    [RESET]: { next: state => ({}) },
  },
  INITIAL_DASHBOARD_STATE.loadingControls,
);

function newDashboard(before, after, isDirty) {
  return {
    ...before,
    ...after,
    embedding_params: syncParametersAndEmbeddingParams(before, after),
    isDirty: isDirty ?? true,
  };
}

const dashboards = handleActions(
  {
    [FETCH_DASHBOARD]: {
      next: (state, { payload }) => ({
        ...state,
        ...payload.entities.dashboard,
      }),
    },
    [SET_DASHBOARD_ATTRIBUTES]: {
      next: (state, { payload: { id, attributes, isDirty } }) => {
        return {
          ...state,
          [id]: newDashboard(state[id], attributes, isDirty),
        };
      },
    },
    [ADD_CARD_TO_DASH]: (state, { payload: dashcard }) => ({
      ...state,
      [dashcard.dashboard_id]: {
        ...state[dashcard.dashboard_id],
        ordered_cards: [
          ...state[dashcard.dashboard_id].ordered_cards,
          dashcard.id,
        ],
      },
    }),
    [CREATE_PUBLIC_LINK]: {
      next: (state, { payload }) =>
        assocIn(state, [payload.id, "public_uuid"], payload.uuid),
    },
    [DELETE_PUBLIC_LINK]: {
      next: (state, { payload }) =>
        assocIn(state, [payload.id, "public_uuid"], null),
    },
    [UPDATE_EMBEDDING_PARAMS]: {
      next: (state, { payload }) =>
        assocIn(
          state,
          [payload.id, "embedding_params"],
          payload.embedding_params,
        ),
    },
    [UPDATE_ENABLE_EMBEDDING]: {
      next: (state, { payload }) =>
        assocIn(
          state,
          [payload.id, "enable_embedding"],
          payload.enable_embedding,
        ),
    },
    [Dashboards.actionTypes.UPDATE]: {
      next: (state, { payload }) =>
        assocIn(
          state,
          [payload.dashboard.id, "collection_id"],
          payload.dashboard.collection_id,
        ),
    },
  },
  INITIAL_DASHBOARD_STATE.dashboards,
);

const dashcards = handleActions(
  {
    [FETCH_DASHBOARD]: {
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
              columnSettings => ({
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
    [REMOVE_CARD_FROM_DASH]: (state, { payload: { dashcardId } }) => ({
      ...state,
      [dashcardId]: { ...state[dashcardId], isRemoved: true },
    }),
    [UNDO_REMOVE_CARD_FROM_DASH]: (state, { payload: { dashcardId } }) => ({
      ...state,
      [dashcardId]: { ...state[dashcardId], isRemoved: false },
    }),
    [MARK_NEW_CARD_SEEN]: (state, { payload: dashcardId }) => ({
      ...state,
      [dashcardId]: { ...state[dashcardId], justAdded: false },
    }),
  },
  INITIAL_DASHBOARD_STATE.dashcards,
);

const isAddParameterPopoverOpen = handleActions(
  {
    [SHOW_ADD_PARAMETER_POPOVER]: () => true,
    [HIDE_ADD_PARAMETER_POPOVER]: () => false,
    [INITIALIZE]: () => false,
    [RESET]: () => false,
  },
  INITIAL_DASHBOARD_STATE.isAddParameterPopoverOpen,
);

const isNavigatingToDashboard = handleActions(
  {
    [INITIALIZE]: () => false,
    [NAVIGATE_TO_NEW_CARD]: () => true,
    [NAVIGATE_TO_DASHBOARD]: () => true,
    [RESET]: () => false,
  },
  INITIAL_DASHBOARD_STATE.isNavigatingToDashboard,
);

const dashcardData = handleActions(
  {
    // clear existing dashboard data when loading a dashboard
    [INITIALIZE]: {
      next: (state, { payload: { isNavigatingToDashboard } }) =>
        isNavigatingToDashboard ? state : {},
    },
    [FETCH_CARD_DATA]: {
      next: (state, { payload: { dashcard_id, card_id, result } }) =>
        assocIn(state, [dashcard_id, card_id], result),
    },
    [CLEAR_CARD_DATA]: {
      next: (state, { payload: { cardId, dashcardId } }) =>
        assocIn(state, [dashcardId, cardId]),
    },
    [RESET]: {
      next: (state, { payload: { isNavigatingToDashboard } }) =>
        isNavigatingToDashboard ? state : {},
    },
  },
  INITIAL_DASHBOARD_STATE.dashcardData,
);

const slowCards = handleActions(
  {
    [MARK_CARD_AS_SLOW]: {
      next: (state, { payload: { id, result } }) => ({
        ...state,
        [id]: result,
      }),
    },
  },
  INITIAL_DASHBOARD_STATE.slowCards,
);

const parameterValues = handleActions(
  {
    [INITIALIZE]: { next: () => ({}) }, // reset values
    [FETCH_DASHBOARD]: {
      next: (state, { payload: { parameterValues } }) => parameterValues,
    },
    [SET_PARAMETER_VALUE]: {
      next: (state, { payload: { id, value, isDraft } }) => {
        if (!isDraft) {
          return assoc(state, id, value);
        }

        return state;
      },
    },
    [SET_PARAMETER_VALUES]: {
      next: (state, { payload }) => payload,
    },
    [REMOVE_PARAMETER]: {
      next: (state, { payload: { id } }) => dissoc(state, id),
    },
    [RESET]: { next: state => ({}) },
  },
  INITIAL_DASHBOARD_STATE.parameterValues,
);

const draftParameterValues = handleActions(
  {
    [INITIALIZE]: { next: () => ({}) },
    [FETCH_DASHBOARD]: {
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
    [REMOVE_PARAMETER]: {
      next: (state, { payload: { id } }) => dissoc(state, id),
    },
    [RESET]: { next: () => ({}) },
  },
  {},
);

const loadingDashCards = handleActions(
  {
    [INITIALIZE]: {
      next: state => ({
        ...state,
        loadingStatus: "idle",
      }),
    },
    [FETCH_DASHBOARD]: {
      next: (state, { payload }) => {
        const cardIds = Object.values(payload.entities.dashcard || {})
          .filter(dc => !isVirtualDashCard(dc))
          .map(dc => dc.id);
        return {
          ...state,
          dashcardIds: cardIds,
          loadingIds: cardIds,
          loadingStatus: "idle",
        };
      },
    },
    [FETCH_DASHBOARD_CARD_DATA]: {
      next: (state, { payload: { currentTime } }) => ({
        ...state,
        loadingStatus: state.dashcardIds.length > 0 ? "running" : "idle",
        startTime: state.dashcardIds.length > 0 ? currentTime : null,
      }),
    },
    [FETCH_CARD_DATA]: {
      next: (state, { payload: { dashcard_id, currentTime } }) => {
        const loadingIds = state.loadingIds.filter(id => id !== dashcard_id);
        return {
          ...state,
          loadingIds,
          ...(loadingIds.length === 0
            ? { endTime: currentTime, loadingStatus: "complete" }
            : {}),
        };
      },
    },
    [CANCEL_FETCH_CARD_DATA]: {
      next: (state, { payload: { dashcard_id } }) => {
        const loadingIds = state.loadingIds.filter(id => id !== dashcard_id);
        return {
          ...state,
          loadingIds,
          ...(loadingIds.length === 0 ? { startTime: null } : {}),
        };
      },
    },
    [RESET]: {
      next: state => ({
        ...state,
        loadingStatus: "idle",
      }),
    },
  },
  INITIAL_DASHBOARD_STATE.loadingDashCards,
);

const DEFAULT_SIDEBAR = { props: {} };
const sidebar = handleActions(
  {
    [INITIALIZE]: {
      next: () => DEFAULT_SIDEBAR,
    },
    [SET_SIDEBAR]: {
      next: (state, { payload: { name, props } }) => ({
        name,
        props: props || {},
      }),
    },
    [CLOSE_SIDEBAR]: {
      next: () => DEFAULT_SIDEBAR,
    },
    [SET_EDITING_DASHBOARD]: {
      next: () => DEFAULT_SIDEBAR,
    },
    [REMOVE_PARAMETER]: {
      next: () => DEFAULT_SIDEBAR,
    },
    [RESET]: {
      next: () => DEFAULT_SIDEBAR,
    },
  },
  INITIAL_DASHBOARD_STATE.sidebar,
);

const missingActionParameters = handleActions(
  {
    [INITIALIZE]: {
      next: (state, payload) => null,
    },
    [RESET]: {
      next: (state, payload) => null,
    },
  },
  INITIAL_DASHBOARD_STATE.missingActionParameters,
);

export const autoApplyFilters = handleActions(
  {
    [SHOW_AUTO_APPLY_FILTERS_TOAST]: {
      next: (state, { payload: { toastId, dashboardId } }) => ({
        ...state,
        toastId,
        toastDashboardId: dashboardId,
      }),
    },
  },
  INITIAL_DASHBOARD_STATE.autoApplyFilters,
);

export default reduceReducers(
  INITIAL_DASHBOARD_STATE,
  combineReducers({
    dashboardId,
    isEditing,
    loadingControls,
    dashboards,
    dashcards,
    dashcardData,
    slowCards,
    parameterValues,
    draftParameterValues,
    loadingDashCards,
    isAddParameterPopoverOpen,
    isNavigatingToDashboard,
    sidebar,
    missingActionParameters,
    autoApplyFilters,
    // Combined reducer needs to init state for every slice
    selectedTabId: (state = INITIAL_DASHBOARD_STATE.selectedTabId) => state,
    tabDeletions: (state = INITIAL_DASHBOARD_STATE.tabDeletions) => state,
  }),
  tabsReducer,
);
