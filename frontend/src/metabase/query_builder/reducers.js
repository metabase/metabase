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
  CLOSE_QB_NEWB_MODAL,
  DESELECT_TIMELINE_EVENTS,
  HIDE_TIMELINE_EVENTS,
  INITIALIZE_QB,
  LOAD_OBJECT_DETAIL_FK_REFERENCES,
  OPEN_DATA_REFERENCE_AT_QUESTION,
  QUERY_COMPLETED,
  QUERY_ERRORED,
  RELOAD_CARD,
  RESET_QB,
  RESET_ROW_ZOOM,
  RESET_UI_CONTROLS,
  RUN_QUERY,
  SELECT_TIMELINE_EVENTS,
  SET_CARD_AND_RUN,
  SET_CURRENT_STATE,
  SET_DATA_REFERENCE_STACK,
  SET_DOCUMENT_TITLE,
  SET_DOCUMENT_TITLE_TIMEOUT_ID,
  SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR,
  SET_METADATA_DIFF,
  SET_MODAL_SNIPPET,
  SET_NATIVE_EDITOR_SELECTED_RANGE,
  SET_PARAMETER_VALUE,
  SET_SHOW_LOADING_COMPLETE_FAVICON,
  SET_SNIPPET_COLLECTION_ID,
  SET_UI_CONTROLS,
  SHOW_CHART_SETTINGS,
  SHOW_TIMELINE_EVENTS,
  TOGGLE_DATA_REFERENCE,
  TOGGLE_SNIPPET_SIDEBAR,
  TOGGLE_TEMPLATE_TAGS_EDITOR,
  ZOOM_IN_ROW,
  onCloseChartSettings,
  onCloseChartType,
  onCloseQuestionInfo,
  onCloseQuestionSettings,
  onCloseSidebars,
  onCloseSummary,
  onCloseTimelines,
  onEditSummary,
  onOpenChartSettings,
  onOpenChartType,
  onOpenQuestionInfo,
  onOpenQuestionSettings,
  onOpenTimelines,
} from "./actions";
import {
  CLOSED_NATIVE_EDITOR_SIDEBARS,
  DEFAULT_DASHBOARD_STATE,
  DEFAULT_LOADING_CONTROLS,
  DEFAULT_QUERY_STATUS,
  DEFAULT_UI_CONTROLS,
  UI_CONTROLS_SIDEBAR_DEFAULTS,
} from "./defaults";

function setUIControls(state, changes) {
  const { queryBuilderMode: currentQBMode, ...currentState } = state;
  const { queryBuilderMode: nextQBMode, ...nextStateChanges } = changes;

  const isChangingQBMode = nextQBMode && currentQBMode !== nextQBMode;
  const isOpeningEditingQBMode = isChangingQBMode && nextQBMode !== "view";

  const queryBuilderMode = nextQBMode || currentQBMode;
  const previousQueryBuilderMode = isChangingQBMode
    ? currentQBMode
    : state.previousQueryBuilderMode;

  // Close all the sidebars when entering notebook/dataset QB modes
  const extraState = isOpeningEditingQBMode ? UI_CONTROLS_SIDEBAR_DEFAULTS : {};

  return {
    ...currentState,
    ...extraState,
    ...nextStateChanges,
    queryBuilderMode,
    previousQueryBuilderMode,
  };
}

export const uiControls = handleActions(
  {
    [SET_UI_CONTROLS]: {
      next: (state, { payload }) => setUIControls(state, payload),
    },

    [RESET_UI_CONTROLS]: {
      next: (state, { payload }) => DEFAULT_UI_CONTROLS,
    },

    [INITIALIZE_QB]: {
      next: (state, { payload }) => {
        return {
          ...state,
          ...DEFAULT_UI_CONTROLS,
          ...CLOSED_NATIVE_EDITOR_SIDEBARS,
          ...payload.uiControls,
        };
      },
    },

    [TOGGLE_DATA_REFERENCE]: {
      next: (state, { payload }) => ({
        ...state,
        ...CLOSED_NATIVE_EDITOR_SIDEBARS,
        isShowingDataReference: !state.isShowingDataReference,
      }),
    },
    [SET_DATA_REFERENCE_STACK]: {
      next: (state, { payload }) => ({
        ...state,
        dataReferenceStack: payload,
      }),
    },
    [OPEN_DATA_REFERENCE_AT_QUESTION]: {
      next: (state, { payload }) => {
        return payload
          ? {
              ...state,
              dataReferenceStack: payload,
              isShowingDataReference: true,
            }
          : state;
      },
    },
    [TOGGLE_TEMPLATE_TAGS_EDITOR]: {
      next: (state, { payload }) => ({
        ...state,
        ...CLOSED_NATIVE_EDITOR_SIDEBARS,
        isShowingTemplateTagsEditor: !state.isShowingTemplateTagsEditor,
      }),
    },
    [TOGGLE_SNIPPET_SIDEBAR]: {
      next: (state, { payload }) => ({
        ...state,
        ...CLOSED_NATIVE_EDITOR_SIDEBARS,
        isShowingSnippetSidebar: !state.isShowingSnippetSidebar,
        snippetCollectionId: null,
      }),
    },
    [SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR]: {
      next: (state, { isShowingTemplateTagsEditor }) => ({
        ...state,
        ...CLOSED_NATIVE_EDITOR_SIDEBARS,
        isShowingTemplateTagsEditor,
      }),
    },
    [SET_NATIVE_EDITOR_SELECTED_RANGE]: (state, { payload }) => ({
      ...state,
      nativeEditorSelectedRange: payload,
    }),
    [SET_MODAL_SNIPPET]: (state, { payload }) => ({
      ...state,
      modalSnippet: payload,
    }),
    [SET_SNIPPET_COLLECTION_ID]: (state, { payload }) => ({
      ...state,
      snippetCollectionId: payload,
    }),
    [CLOSE_QB_NEWB_MODAL]: {
      next: (state, { payload }) => ({ ...state, isShowingNewbModal: false }),
    },

    [RUN_QUERY]: state => ({
      ...state,
      isRunning: true,
    }),
    [CANCEL_QUERY]: {
      next: (state, { payload }) => ({ ...state, isRunning: false }),
    },
    [QUERY_COMPLETED]: {
      next: (state, { payload }) => ({
        ...state,
        isRunning: false,
      }),
    },
    [QUERY_ERRORED]: {
      next: (state, { payload }) => ({ ...state, isRunning: false }),
    },

    [SHOW_CHART_SETTINGS]: {
      next: (state, { payload }) => ({
        ...state,
        ...UI_CONTROLS_SIDEBAR_DEFAULTS,
        isShowingChartSettingsSidebar: true,
        initialChartSetting: payload,
      }),
    },
    // AGGREGATION
    [onEditSummary]: state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      isShowingSummarySidebar: true,
    }),
    [onCloseSummary]: state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
    }),
    [onOpenChartSettings]: (
      state,
      { payload: { initialChartSettings, showSidebarTitle = false } = {} },
    ) => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      isShowingChartSettingsSidebar: true,
      initialChartSetting: initialChartSettings,
      showSidebarTitle: showSidebarTitle,
    }),
    [onCloseChartSettings]: state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
    }),
    [onOpenChartType]: state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      isShowingChartTypeSidebar: true,
    }),
    [onCloseChartType]: state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
    }),
    [onOpenQuestionInfo]: state =>
      setUIControls(state, {
        ...UI_CONTROLS_SIDEBAR_DEFAULTS,
        isShowingQuestionInfoSidebar: true,
        queryBuilderMode: "view",
      }),
    [onCloseQuestionInfo]: state => ({
      ...state,
      isShowingQuestionInfoSidebar: false,
    }),
    [onOpenQuestionSettings]: state =>
      setUIControls(state, {
        ...UI_CONTROLS_SIDEBAR_DEFAULTS,
        isShowingQuestionSettingsSidebar: true,
        queryBuilderMode: "view",
      }),
    [onCloseQuestionSettings]: state => ({
      ...state,
      isShowingQuestionSettingsSidebar: false,
    }),
    [onOpenTimelines]: state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      ...CLOSED_NATIVE_EDITOR_SIDEBARS,
      isShowingTimelineSidebar: true,
    }),
    [onCloseTimelines]: state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
    }),
    [onCloseSidebars]: state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
    }),
  },
  DEFAULT_UI_CONTROLS,
);

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
