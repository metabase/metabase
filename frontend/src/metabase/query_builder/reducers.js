import { assoc, merge } from "icepick";
import { handleActions } from "redux-actions";
import _ from "underscore";

import {
  EDIT_QUESTION,
  NAVIGATE_TO_NEW_CARD,
} from "metabase/dashboard/actions";
import TimelineEvents from "metabase/entities/timeline-events";
import { copy } from "metabase/lib/utils";

import {
  API_CREATE_QUESTION,
  API_UPDATE_QUESTION,
  CANCEL_QUERY,
  CANCEL_QUESTION_CHANGES,
  CLEAR_OBJECT_DETAIL_FK_REFERENCES,
  CLEAR_QUERY_RESULT,
  CLOSE_QB,
  DESELECT_TIMELINE_EVENTS,
  HIDE_TIMELINE_EVENTS,
  INITIALIZE_QB,
  LOAD_OBJECT_DETAIL_FK_REFERENCES,
  QUERY_COMPLETED,
  QUERY_ERRORED,
  RELOAD_CARD,
  RESET_QB,
  RESET_ROW_ZOOM,
  RUN_QUERY,
  SELECT_TIMELINE_EVENTS,
  SET_CARD_AND_RUN,
  SET_CURRENT_STATE,
  SET_DOCUMENT_TITLE,
  SET_DOCUMENT_TITLE_TIMEOUT_ID,
  SET_METADATA_DIFF,
  SET_PARAMETER_VALUE,
  SET_SHOW_LOADING_COMPLETE_FAVICON,
  SHOW_TIMELINE_EVENTS,
  ZOOM_IN_ROW,
  onCloseTimelines,
} from "./actions";

const DEFAULT_LOADING_CONTROLS = {
  showLoadCompleteFavicon: false,
  documentTitle: "",
  timeoutId: "",
};

const DEFAULT_DASHBOARD_STATE = {
  dashboardId: null,
  isEditing: false,
};

const DEFAULT_QUERY_STATUS = "idle";

export const loadingControls = handleActions(
  {
    [SET_DOCUMENT_TITLE]: (state, { payload }) => ({
      ...state,
      documentTitle: payload,
    }),
    [SET_SHOW_LOADING_COMPLETE_FAVICON]: (state, { payload }) => ({
      ...state,
      showLoadCompleteFavicon: payload,
    }),
    [SET_DOCUMENT_TITLE_TIMEOUT_ID]: (state, { payload }) => ({
      ...state,
      timeoutId: payload,
    }),
  },
  DEFAULT_LOADING_CONTROLS,
);

export const queryStatus = handleActions(
  {
    [RUN_QUERY]: state => "running",
    [QUERY_COMPLETED]: state => "complete",
    [CANCEL_QUERY]: state => "idle",
  },
  DEFAULT_QUERY_STATUS,
);

export const zoomedRowObjectId = handleActions(
  {
    [INITIALIZE_QB]: {
      next: (state, { payload }) => payload?.objectId ?? null,
    },
    [ZOOM_IN_ROW]: {
      next: (state, { payload }) => payload.objectId,
    },
    [RESET_ROW_ZOOM]: { next: () => null },
    [RESET_QB]: { next: () => null },
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
        payload.originalCard ? copy(payload.originalCard) : null,
    },
    [RELOAD_CARD]: {
      next: (state, { payload }) => (payload.id ? copy(payload) : null),
    },
    [SET_CARD_AND_RUN]: {
      next: (state, { payload }) =>
        payload.originalCard ? copy(payload.originalCard) : null,
    },
    [API_CREATE_QUESTION]: {
      next: (state, { payload }) => copy(payload),
    },
    [API_UPDATE_QUESTION]: {
      next: (state, { payload }) => copy(payload),
    },
  },
  null,
);

// references to FK tables specifically used on the ObjectDetail page.
export const tableForeignKeyReferences = handleActions(
  {
    [LOAD_OBJECT_DETAIL_FK_REFERENCES]: {
      next: (state, { payload }) => payload,
    },
    [CLEAR_OBJECT_DETAIL_FK_REFERENCES]: () => null,
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
      next: (state, { payload: { queryResults } }) => queryResults,
    },
    [QUERY_ERRORED]: {
      next: (state, { payload }) => (payload ? [payload] : state),
    },
    [CLEAR_QUERY_RESULT]: { next: (state, { payload }) => null },
  },
  null,
);

export const metadataDiff = handleActions(
  {
    [RESET_QB]: { next: () => ({}) },
    [API_CREATE_QUESTION]: { next: () => ({}) },
    [API_UPDATE_QUESTION]: { next: () => ({}) },
    [SET_METADATA_DIFF]: {
      next: (state, { payload }) => {
        const { name, changes } = payload;
        return {
          ...state,
          [name]: state[name] ? merge(state[name], changes) : changes,
        };
      },
    },
    [CANCEL_QUESTION_CHANGES]: { next: () => ({}) },
  },
  {},
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

export const queryStartTime = handleActions(
  {
    [RUN_QUERY]: { next: (state, { payload }) => performance.now() },
    [CANCEL_QUERY]: { next: (state, { payload }) => null },
    [QUERY_COMPLETED]: { next: (state, { payload }) => null },
    [QUERY_ERRORED]: { next: (state, { payload }) => null },
  },
  null,
);

export const parameterValues = handleActions(
  {
    [INITIALIZE_QB]: {
      next: (state, { payload: { parameterValues } }) => parameterValues,
    },
    [SET_PARAMETER_VALUE]: {
      next: (state, { payload: { id, value } }) => assoc(state, id, value),
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

export const parentDashboard = handleActions(
  {
    [NAVIGATE_TO_NEW_CARD]: {
      next: (state, { payload: { dashboardId } }) => ({
        dashboardId,
        isEditing: false,
      }),
    },
    [EDIT_QUESTION]: {
      next: (state, { payload: { dashboardId } }) => ({
        dashboardId,
        isEditing: true,
      }),
    },
    [CLOSE_QB]: { next: () => DEFAULT_DASHBOARD_STATE },
  },
  DEFAULT_DASHBOARD_STATE,
);

export const visibleTimelineEventIds = handleActions(
  {
    [INITIALIZE_QB]: { next: () => [] },
    [SHOW_TIMELINE_EVENTS]: {
      next: (state, { payload: events }) =>
        _.uniq([...state, ...events.map(event => event.id)]),
    },
    [HIDE_TIMELINE_EVENTS]: {
      next: (state, { payload: events }) => {
        const eventIdsToHide = events.map(event => event.id);
        return state.filter(eventId => !eventIdsToHide.includes(eventId));
      },
    },
    [TimelineEvents.actionTypes.CREATE]: {
      next: (state, { payload }) => [...state, payload.timelineEvent.id],
    },
    [RESET_QB]: { next: () => [] },
  },
  [],
);

export const selectedTimelineEventIds = handleActions(
  {
    [INITIALIZE_QB]: { next: () => [] },
    [SELECT_TIMELINE_EVENTS]: {
      next: (state, { payload: events = [] }) => events.map(e => e.id),
    },
    [DESELECT_TIMELINE_EVENTS]: {
      next: () => [],
    },
    [onCloseTimelines]: { next: () => [] },
    [RESET_QB]: { next: () => [] },
  },
  [],
);

export * from "./reducers-typed";
