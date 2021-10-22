import { assoc, dissoc, assocIn, updateIn, chain, merge } from "icepick";

import { handleActions, combineReducers } from "metabase/lib/redux";

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
  UPDATE_DASHCARD_ID,
  MARK_CARD_AS_SLOW,
  SET_PARAMETER_VALUE,
  FETCH_DASHBOARD_CARD_DATA,
  CANCEL_FETCH_CARD_DATA,
  SHOW_ADD_PARAMETER_POPOVER,
  HIDE_ADD_PARAMETER_POPOVER,
  SET_SIDEBAR,
  CLOSE_SIDEBAR,
} from "./actions";
import { isVirtualDashCard, syncParametersAndEmbeddingParams } from "./utils";

const dashboardId = handleActions(
  {
    [INITIALIZE]: { next: state => null },
    [FETCH_DASHBOARD]: {
      next: (state, { payload: { dashboardId } }) => dashboardId,
    },
  },
  null,
);

const isEditing = handleActions(
  {
    [INITIALIZE]: { next: state => null },
    [SET_EDITING_DASHBOARD]: {
      next: (state, { payload }) => (payload ? payload : null),
    },
  },
  {},
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
  },
  {},
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
      next: (state, { payload: dashcards }) => {
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
    [MARK_NEW_CARD_SEEN]: (state, { payload: dashcardId }) => ({
      ...state,
      [dashcardId]: { ...state[dashcardId], justAdded: false },
    }),
  },
  {},
);

const isAddParameterPopoverOpen = handleActions(
  {
    [SHOW_ADD_PARAMETER_POPOVER]: () => true,
    [HIDE_ADD_PARAMETER_POPOVER]: () => false,
    [INITIALIZE]: () => false,
  },
  false,
);

const dashcardData = handleActions(
  {
    // clear existing dashboard data when loading a dashboard
    [INITIALIZE]: { next: state => ({}) },
    [FETCH_CARD_DATA]: {
      next: (state, { payload: { dashcard_id, card_id, result } }) =>
        assocIn(state, [dashcard_id, card_id], result),
    },
    [CLEAR_CARD_DATA]: {
      next: (state, { payload: { cardId, dashcardId } }) =>
        assocIn(state, [dashcardId, cardId]),
    },
    [UPDATE_DASHCARD_ID]: {
      next: (state, { payload: { oldDashcardId, newDashcardId } }) =>
        chain(state)
          .assoc(newDashcardId, state[oldDashcardId])
          .dissoc(oldDashcardId)
          .value(),
    },
  },
  {},
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
  {},
);

const parameterValues = handleActions(
  {
    [INITIALIZE]: { next: () => ({}) }, // reset values
    [SET_PARAMETER_VALUE]: {
      next: (state, { payload: { id, value } }) => assoc(state, id, value),
    },
    [REMOVE_PARAMETER]: {
      next: (state, { payload: { id } }) => dissoc(state, id),
    },
    [FETCH_DASHBOARD]: {
      next: (state, { payload: { parameterValues } }) => parameterValues,
    },
  },
  {},
);

const loadingDashCards = handleActions(
  {
    [FETCH_DASHBOARD]: {
      next: (state, { payload }) => ({
        ...state,
        dashcardIds: Object.values(payload.entities.dashcard || {})
          .filter(dc => !isVirtualDashCard(dc))
          .map(dc => dc.id),
      }),
    },
    [FETCH_DASHBOARD_CARD_DATA]: {
      next: state => ({
        ...state,
        loadingIds: state.dashcardIds,
        startTime:
          state.dashcardIds.length > 0 &&
          // check that performance is defined just in case
          typeof performance === "object"
            ? performance.now()
            : null,
      }),
    },
    [FETCH_CARD_DATA]: {
      next: (state, { payload: { dashcard_id } }) => {
        const loadingIds = state.loadingIds.filter(id => id !== dashcard_id);
        return {
          ...state,
          loadingIds,
          ...(loadingIds.length === 0 ? { startTime: null } : {}),
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
  },
  { dashcardIds: [], loadingIds: [], startTime: null },
);

const DEFAULT_SIDEBAR = { props: {} };
const sidebar = handleActions(
  {
    [SET_SIDEBAR]: {
      next: (state, { payload: { name, props } }) => ({
        name,
        props: props || {},
      }),
    },
    [CLOSE_SIDEBAR]: {
      next: () => DEFAULT_SIDEBAR,
    },
    [INITIALIZE]: {
      next: () => DEFAULT_SIDEBAR,
    },
    [SET_EDITING_DASHBOARD]: {
      next: (state, { payload: isEditing }) =>
        isEditing ? state : DEFAULT_SIDEBAR,
    },
    [REMOVE_PARAMETER]: {
      next: () => DEFAULT_SIDEBAR,
    },
  },
  DEFAULT_SIDEBAR,
);

export default combineReducers({
  dashboardId,
  isEditing,
  dashboards,
  dashcards,
  dashcardData,
  slowCards,
  parameterValues,
  loadingDashCards,
  isAddParameterPopoverOpen,
  sidebar,
});
