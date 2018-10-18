import Utils from "metabase/lib/utils";
import { handleActions } from "redux-actions";
import { assoc, dissoc } from "icepick";

import {
  RESET_QB,
  INITIALIZE_QB,
  TOGGLE_DATA_REFERENCE,
  TOGGLE_TEMPLATE_TAGS_EDITOR,
  SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR,
  CLOSE_QB_TUTORIAL,
  CLOSE_QB_NEWB_MODAL,
  BEGIN_EDITING,
  CANCEL_EDITING,
  LOAD_TABLE_METADATA,
  LOAD_DATABASE_FIELDS,
  RELOAD_CARD,
  API_CREATE_QUESTION,
  API_UPDATE_QUESTION,
  SET_CARD_AND_RUN,
  SET_CARD_ATTRIBUTE,
  SET_CARD_VISUALIZATION,
  UPDATE_CARD_VISUALIZATION_SETTINGS,
  REPLACE_ALL_CARD_VISUALIZATION_SETTINGS,
  UPDATE_TEMPLATE_TAG,
  SET_PARAMETER_VALUE,
  SET_QUERY_DATABASE,
  SET_QUERY_SOURCE_TABLE,
  SET_QUERY_MODE,
  UPDATE_QUESTION,
  SET_DATASET_QUERY,
  RUN_QUERY,
  CLEAR_QUERY_RESULT,
  CANCEL_QUERY,
  QUERY_COMPLETED,
  QUERY_ERRORED,
  LOAD_OBJECT_DETAIL_FK_REFERENCES,
  SET_CURRENT_STATE,
  CREATE_PUBLIC_LINK,
  DELETE_PUBLIC_LINK,
  UPDATE_ENABLE_EMBEDDING,
  UPDATE_EMBEDDING_PARAMS,
  SHOW_CHART_SETTINGS,
} from "./actions";

// various ui state options
export const uiControls = handleActions(
  {
    [INITIALIZE_QB]: {
      next: (state, { payload }) => ({ ...state, ...payload.uiControls }),
    },

    [TOGGLE_DATA_REFERENCE]: {
      next: (state, { payload }) => ({
        ...state,
        isShowingDataReference: !state.isShowingDataReference,
        isShowingTemplateTagsEditor: false,
      }),
    },
    [TOGGLE_TEMPLATE_TAGS_EDITOR]: {
      next: (state, { payload }) => ({
        ...state,
        isShowingTemplateTagsEditor: !state.isShowingTemplateTagsEditor,
        isShowingDataReference: false,
      }),
    },
    [SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR]: {
      next: (state, { isShowingTemplateTagsEditor }) => ({
        ...state,
        isShowingTemplateTagsEditor,
        isShowingDataReference: false,
      }),
    },
    [SET_DATASET_QUERY]: {
      next: (state, { payload }) => ({
        ...state,
        isShowingTemplateTagsEditor: payload.openTemplateTagsEditor,
      }),
    },
    [CLOSE_QB_TUTORIAL]: {
      next: (state, { payload }) => ({ ...state, isShowingTutorial: false }),
    },
    [CLOSE_QB_NEWB_MODAL]: {
      next: (state, { payload }) => ({ ...state, isShowingNewbModal: false }),
    },

    [BEGIN_EDITING]: {
      next: (state, { payload }) => ({ ...state, isEditing: true }),
    },
    [CANCEL_EDITING]: {
      next: (state, { payload }) => ({ ...state, isEditing: false }),
    },
    [API_UPDATE_QUESTION]: {
      next: (state, { payload }) => ({ ...state, isEditing: false }),
    },
    [RELOAD_CARD]: {
      next: (state, { payload }) => ({ ...state, isEditing: false }),
    },

    [RUN_QUERY]: state => ({ ...state, isRunning: true }),
    [CANCEL_QUERY]: {
      next: (state, { payload }) => ({ ...state, isRunning: false }),
    },
    [QUERY_COMPLETED]: {
      next: (state, { payload }) => ({ ...state, isRunning: false }),
    },
    [QUERY_ERRORED]: {
      next: (state, { payload }) => ({ ...state, isRunning: false }),
    },

    [SHOW_CHART_SETTINGS]: {
      next: (state, { payload }) => ({ ...state, chartSettings: payload }),
    },
  },
  {
    isShowingDataReference: false,
    isShowingTemplateTagsEditor: false,
    isShowingTutorial: false,
    isShowingNewbModal: false,
    isEditing: false,
    isRunning: false,
    chartSettings: null,
  },
);

// the card that is actively being worked on
export const card = handleActions(
  {
    [RESET_QB]: { next: (state, { payload }) => null },
    [INITIALIZE_QB]: {
      next: (state, { payload }) => (payload ? payload.card : null),
    },
    [RELOAD_CARD]: { next: (state, { payload }) => payload },
    [CANCEL_EDITING]: { next: (state, { payload }) => payload },
    [SET_CARD_AND_RUN]: { next: (state, { payload }) => payload.card },
    [API_CREATE_QUESTION]: { next: (state, { payload }) => payload },
    [API_UPDATE_QUESTION]: { next: (state, { payload }) => payload },

    [SET_CARD_ATTRIBUTE]: {
      next: (state, { payload }) => ({
        ...state,
        [payload.attr]: payload.value,
      }),
    },
    [SET_CARD_VISUALIZATION]: { next: (state, { payload }) => payload },
    [UPDATE_CARD_VISUALIZATION_SETTINGS]: {
      next: (state, { payload }) => payload,
    },
    [REPLACE_ALL_CARD_VISUALIZATION_SETTINGS]: {
      next: (state, { payload }) => payload,
    },

    [UPDATE_TEMPLATE_TAG]: { next: (state, { payload }) => payload },

    [SET_QUERY_MODE]: { next: (state, { payload }) => payload },
    [SET_QUERY_DATABASE]: { next: (state, { payload }) => payload },
    [SET_QUERY_SOURCE_TABLE]: { next: (state, { payload }) => payload },
    [SET_DATASET_QUERY]: { next: (state, { payload }) => payload.card },
    [UPDATE_QUESTION]: (state, { payload: { card } }) => card,

    [QUERY_COMPLETED]: {
      next: (state, { payload }) => ({
        ...state,
        display: payload.cardDisplay,
      }),
    },

    [CREATE_PUBLIC_LINK]: {
      next: (state, { payload }) => ({ ...state, public_uuid: payload.uuid }),
    },
    [DELETE_PUBLIC_LINK]: {
      next: (state, { payload }) => ({ ...state, public_uuid: null }),
    },
    [UPDATE_ENABLE_EMBEDDING]: {
      next: (state, { payload }) => ({
        ...state,
        enable_embedding: payload.enable_embedding,
      }),
    },
    [UPDATE_EMBEDDING_PARAMS]: {
      next: (state, { payload }) => ({
        ...state,
        embedding_params: payload.embedding_params,
      }),
    },
  },
  null,
);

// a copy of the card being worked on at it's last known saved state.  if the card is NEW then this should be null.
// NOTE: we use JSON serialization/deserialization to ensure a deep clone of the object which is required
//       because we can't have any links between the active card being modified and the "originalCard" for testing dirtiness
// ALSO: we consistently check for payload.id because an unsaved card has no "originalCard"
export const originalCard = handleActions(
  {
    [INITIALIZE_QB]: {
      next: (state, { payload }) =>
        payload.originalCard ? Utils.copy(payload.originalCard) : null,
    },
    [RELOAD_CARD]: {
      next: (state, { payload }) => (payload.id ? Utils.copy(payload) : null),
    },
    [CANCEL_EDITING]: {
      next: (state, { payload }) => (payload.id ? Utils.copy(payload) : null),
    },
    [SET_CARD_AND_RUN]: {
      next: (state, { payload }) =>
        payload.originalCard ? Utils.copy(payload.originalCard) : null,
    },
    [API_CREATE_QUESTION]: {
      next: (state, { payload }) => Utils.copy(payload),
    },
    [API_UPDATE_QUESTION]: {
      next: (state, { payload }) => Utils.copy(payload),
    },
  },
  null,
);

export const tableForeignKeys = handleActions(
  {
    [RESET_QB]: { next: (state, { payload }) => null },
    [LOAD_TABLE_METADATA]: {
      next: (state, { payload }) =>
        payload && payload.foreignKeys ? payload.foreignKeys : state,
    },
  },
  null,
);

export const databaseFields = handleActions(
  {
    [LOAD_DATABASE_FIELDS]: {
      next: (state, { payload }) => ({ [payload.id]: payload.fields }),
    },
  },
  {},
);

// references to FK tables specifically used on the ObjectDetail page.
export const tableForeignKeyReferences = handleActions(
  {
    [LOAD_OBJECT_DETAIL_FK_REFERENCES]: {
      next: (state, { payload }) => payload,
    },
  },
  null,
);

export const lastRunCard = handleActions(
  {
    [RESET_QB]: { next: (state, { payload }) => null },
    [QUERY_COMPLETED]: { next: (state, { payload }) => payload.card },
    [QUERY_ERRORED]: { next: (state, { payload }) => null },
  },
  null,
);

// The results of a query execution.  optionally an error if the query fails to complete successfully.
export const queryResults = handleActions(
  {
    [RESET_QB]: { next: (state, { payload }) => null },
    [QUERY_COMPLETED]: {
      next: (state, { payload }) => payload.queryResults,
    },
    [QUERY_ERRORED]: {
      next: (state, { payload }) => (payload ? [payload] : state),
    },
    [CLEAR_QUERY_RESULT]: { next: (state, { payload }) => null },
  },
  null,
);

// promise used for tracking a query execution in progress.  when a query is started we capture this.
export const cancelQueryDeferred = handleActions(
  {
    [RUN_QUERY]: {
      next: (state, { payload: { cancelQueryDeferred } }) =>
        cancelQueryDeferred,
    },
    [CANCEL_QUERY]: { next: (state, { payload }) => null },
    [QUERY_COMPLETED]: { next: (state, { payload }) => null },
    [QUERY_ERRORED]: { next: (state, { payload }) => null },
  },
  null,
);

export const parameterValues = handleActions(
  {
    [SET_PARAMETER_VALUE]: {
      next: (state, { payload: { id, value } }) =>
        value == null ? dissoc(state, id) : assoc(state, id, value),
    },
  },
  {},
);

export const currentState = handleActions(
  {
    [SET_CURRENT_STATE]: { next: (state, { payload }) => payload },
  },
  null,
);
