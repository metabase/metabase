import Utils from "metabase/lib/utils";
import { handleActions } from "redux-actions";
import { assoc, dissoc, merge } from "icepick";
import _ from "underscore";

import {
  RESET_QB,
  INITIALIZE_QB,
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
  SET_TEMPLATE_TAG,
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
  SET_RESULTS_METADATA,
  SET_METADATA_DIFF,
  ZOOM_IN_ROW,
  RESET_ROW_ZOOM,
  onEditSummary,
  onCloseSummary,
  onAddFilter,
  onCloseFilter,
  onOpenChartSettings,
  onCloseChartSettings,
  onOpenChartType,
  onCloseChartType,
  onCloseSidebars,
  onOpenQuestionDetails,
  onCloseQuestionDetails,
  onOpenQuestionHistory,
  onCloseQuestionHistory,
  onOpenTimelines,
  onCloseTimelines,
  SHOW_TIMELINES,
  HIDE_TIMELINES,
  SELECT_TIMELINE_EVENTS,
  DESELECT_TIMELINE_EVENTS,
  SET_DOCUMENT_TITLE,
  SET_SHOW_LOADING_COMPLETE_FAVICON,
  SET_DOCUMENT_TITLE_TIMEOUT_ID,
} from "./actions";

const DEFAULT_UI_CONTROLS = {
  isShowingDataReference: false,
  isShowingTemplateTagsEditor: false,
  isShowingNewbModal: false,
  isEditing: false,
  isRunning: false,
  isQueryComplete: false,
  isShowingSummarySidebar: false,
  isShowingFilterSidebar: false,
  isShowingChartTypeSidebar: false,
  isShowingChartSettingsSidebar: false,
  isShowingQuestionDetailsSidebar: false,
  isShowingTimelineSidebar: false,
  initialChartSetting: null,
  isPreviewing: true, // sql preview mode
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

const DEFAULT_QUERY_STATUS = "idle";

const UI_CONTROLS_SIDEBAR_DEFAULTS = {
  isShowingSummarySidebar: false,
  isShowingFilterSidebar: false,
  isShowingChartSettingsSidebar: false,
  isShowingChartTypeSidebar: false,
  isShowingQuestionDetailsSidebar: false,
  isShowingTimelineSidebar: false,
};

// this is used to close other sidebar when one is updated
const CLOSED_NATIVE_EDITOR_SIDEBARS = {
  isShowingTemplateTagsEditor: false,
  isShowingSnippetSidebar: false,
  isShowingDataReference: false,
  isShowingQuestionDetailsSidebar: false,
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

    [API_UPDATE_QUESTION]: {
      next: (state, { payload }) => ({ ...state, isEditing: false }),
    },
    [RELOAD_CARD]: {
      next: (state, { payload }) => ({ ...state, isEditing: false }),
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
    [onAddFilter]: state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      isShowingFilterSidebar: true,
    }),
    [onCloseFilter]: state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
    }),
    [onOpenChartSettings]: (state, { payload: initial }) => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      isShowingChartSettingsSidebar: true,
      initialChartSetting: initial,
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
    [onOpenQuestionDetails]: state =>
      setUIControls(state, {
        ...UI_CONTROLS_SIDEBAR_DEFAULTS,
        isShowingQuestionDetailsSidebar: true,
        questionDetailsTimelineDrawerState: undefined,
        queryBuilderMode: "view",
      }),
    [onCloseQuestionDetails]: (
      state,
      { payload: { closeOtherSidebars } = {} } = {},
    ) => {
      if (closeOtherSidebars) {
        return {
          ...state,
          ...UI_CONTROLS_SIDEBAR_DEFAULTS,
          questionDetailsTimelineDrawerState: undefined,
        };
      }
      return {
        ...state,
        isShowingQuestionDetailsSidebar: false,
        questionDetailsTimelineDrawerState: undefined,
      };
    },
    [onOpenQuestionHistory]: state =>
      setUIControls(state, {
        ...UI_CONTROLS_SIDEBAR_DEFAULTS,
        isShowingQuestionDetailsSidebar: true,
        questionDetailsTimelineDrawerState: "open",
        queryBuilderMode: "view",
      }),
    [onCloseQuestionHistory]: state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      isShowingQuestionDetailsSidebar: true,
      questionDetailsTimelineDrawerState: "closed",
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

    [SET_TEMPLATE_TAG]: { next: (state, { payload }) => payload },

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
    [CANCEL_DATASET_CHANGES]: { next: () => null },
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
    [SET_RESULTS_METADATA]: {
      next: (state, { payload: results_metadata }) => {
        const [result] = state;
        const { columns } = results_metadata;
        return [
          {
            ...result,
            data: {
              ...result.data,
              cols: columns,
              results_metadata,
            },
          },
        ];
      },
    },
    [CLEAR_QUERY_RESULT]: { next: (state, { payload }) => null },
    [CANCEL_DATASET_CHANGES]: { next: () => null },
  },
  null,
);

export const metadataDiff = handleActions(
  {
    [RESET_QB]: { next: () => ({}) },
    [API_UPDATE_QUESTION]: { next: () => ({}) },
    [SET_METADATA_DIFF]: {
      next: (state, { payload }) => {
        const { field_ref, changes } = payload;
        return {
          ...state,
          [field_ref]: state[field_ref]
            ? merge(state[field_ref], changes)
            : changes,
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

export const visibleTimelineIds = handleActions(
  {
    [INITIALIZE_QB]: { next: () => [] },
    [SHOW_TIMELINES]: {
      next: (state, { payload: timelines }) => [
        ...state,
        ...timelines.map(t => t.id),
      ],
    },
    [HIDE_TIMELINES]: {
      next: (state, { payload: timelines }) =>
        _.without(state, ...timelines.map(t => t.id)),
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
    [HIDE_TIMELINES]: {
      next: (state, { payload: timelines }) =>
        _.without(state, ...timelines.flatMap(t => t.events.map(e => e.id))),
    },
    [onCloseTimelines]: { next: () => [] },
    [RESET_QB]: { next: () => [] },
  },
  [],
);
