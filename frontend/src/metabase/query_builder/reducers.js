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
  RESET_QB,
  INITIALIZE_QB,
  SET_DATA_REFERENCE_STACK,
  OPEN_DATA_REFERENCE_AT_QUESTION,
  TOGGLE_DATA_REFERENCE,
  TOGGLE_TEMPLATE_TAGS_EDITOR,
  TOGGLE_SNIPPET_SIDEBAR,
  SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR,
  SET_NATIVE_EDITOR_SELECTED_RANGE,
  SET_MODAL_SNIPPET,
  SET_SNIPPET_COLLECTION_ID,
  CLOSE_QB_NEWB_MODAL,
  SOFT_RELOAD_CARD,
  RELOAD_CARD,
  API_CREATE_QUESTION,
  API_UPDATE_QUESTION,
  SET_CARD_AND_RUN,
  SET_PARAMETER_VALUE,
  UPDATE_QUESTION,
  RUN_QUERY,
  CLEAR_QUERY_RESULT,
  CANCEL_QUERY,
  QUERY_COMPLETED,
  QUERY_ERRORED,
  LOAD_OBJECT_DETAIL_FK_REFERENCES,
  CLEAR_OBJECT_DETAIL_FK_REFERENCES,
  SET_CURRENT_STATE,
  CREATE_PUBLIC_LINK,
  DELETE_PUBLIC_LINK,
  UPDATE_ENABLE_EMBEDDING,
  UPDATE_EMBEDDING_PARAMS,
  SHOW_CHART_SETTINGS,
  SET_UI_CONTROLS,
  RESET_UI_CONTROLS,
  CANCEL_DATASET_CHANGES,
  SET_METADATA_DIFF,
  ZOOM_IN_ROW,
  RESET_ROW_ZOOM,
  onEditSummary,
  onCloseSummary,
  onOpenChartSettings,
  onCloseChartSettings,
  onOpenChartType,
  onCloseChartType,
  onCloseSidebars,
  onOpenQuestionInfo,
  onCloseQuestionInfo,
  onOpenTimelines,
  onCloseTimelines,
  HIDE_TIMELINE_EVENTS,
  SHOW_TIMELINE_EVENTS,
  SELECT_TIMELINE_EVENTS,
  DESELECT_TIMELINE_EVENTS,
  SET_DOCUMENT_TITLE,
  SET_SHOW_LOADING_COMPLETE_FAVICON,
  SET_DOCUMENT_TITLE_TIMEOUT_ID,
  CLOSE_QB,
} from "./actions";

const DEFAULT_UI_CONTROLS = {
  dataReferenceStack: null,
  isModifiedFromNotebook: false,
  isShowingDataReference: false,
  isShowingTemplateTagsEditor: false,
  isShowingNewbModal: false,
  isRunning: false,
  isQueryComplete: false,
  isShowingSummarySidebar: false,
  isShowingChartTypeSidebar: false,
  isShowingChartSettingsSidebar: false,
  isShowingQuestionInfoSidebar: false,
  isShowingTimelineSidebar: false,
  isNativeEditorOpen: false,
  initialChartSetting: null,
  isShowingRawTable: false, // table/viz toggle
  queryBuilderMode: false, // "view" | "notebook" | "dataset"
  previousQueryBuilderMode: false,
  snippetCollectionId: null,
  datasetEditorTab: "query", // "query" / "metadata"
};

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

const UI_CONTROLS_SIDEBAR_DEFAULTS = {
  isShowingSummarySidebar: false,
  isShowingChartSettingsSidebar: false,
  isShowingChartTypeSidebar: false,
  isShowingTimelineSidebar: false,
  isShowingQuestionInfoSidebar: false,
};

// this is used to close other sidebar when one is updated
const CLOSED_NATIVE_EDITOR_SIDEBARS = {
  isShowingTemplateTagsEditor: false,
  isShowingSnippetSidebar: false,
  isShowingDataReference: false,
  isShowingTimelineSidebar: false,
};

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

// the card that is actively being worked on
export const card = handleActions(
  {
    [RESET_QB]: { next: (state, { payload }) => null },
    [INITIALIZE_QB]: {
      next: (state, { payload }) => (payload ? payload.card : null),
    },
    [SOFT_RELOAD_CARD]: { next: (state, { payload }) => payload },
    [RELOAD_CARD]: { next: (state, { payload }) => payload },
    [SET_CARD_AND_RUN]: { next: (state, { payload }) => payload.card },
    [API_CREATE_QUESTION]: { next: (state, { payload }) => payload },
    [API_UPDATE_QUESTION]: { next: (state, { payload }) => payload },

    [CANCEL_DATASET_CHANGES]: { next: (state, { payload }) => payload.card },

    [UPDATE_QUESTION]: (state, { payload: { card } }) => card,

    [QUERY_COMPLETED]: {
      next: (state, { payload: { card } }) => ({
        ...state,
        display: card.display,
        result_metadata: card.result_metadata,
        visualization_settings: card.visualization_settings,
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
        initially_published_at: payload.initially_published_at,
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
    [CANCEL_DATASET_CHANGES]: { next: () => ({}) },
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
