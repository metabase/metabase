import { createReducer } from "@reduxjs/toolkit";
import { assoc, merge } from "icepick";
import _ from "underscore";

import {
  createCardPublicLink,
  deleteCardPublicLink,
  updateCardEmbeddingParams,
  updateCardEnableEmbedding,
} from "metabase/api";
import { TimelineEvents } from "metabase/entities/timeline-events";
import { EDIT_QUESTION, NAVIGATE_TO_NEW_CARD } from "metabase/redux/dashboard";
import {
  API_UPDATE_QUESTION,
  CANCEL_QUERY,
  CANCEL_QUESTION_CHANGES,
  CLEAR_QUERY_RESULT,
  CLOSE_AI_QUESTION_ANALYSIS_SIDEBAR,
  CLOSE_CHART_SETTINGS,
  CLOSE_CHART_TYPE,
  CLOSE_QB,
  CLOSE_QB_NEWB_MODAL,
  CLOSE_QUESTION_INFO,
  CLOSE_QUESTION_SETTINGS,
  CLOSE_SIDEBARS,
  CLOSE_TIMELINES,
  EDIT_SUMMARY,
  INITIALIZE_QB,
  ON_CLOSE_SUMMARY,
  OPEN_AI_QUESTION_ANALYSIS_SIDEBAR,
  OPEN_CHART_SETTINGS,
  OPEN_CHART_TYPE,
  OPEN_QUESTION_INFO,
  OPEN_QUESTION_SETTINGS,
  OPEN_TIMELINES,
  QUERY_COMPLETED,
  QUERY_ERRORED,
  RESET_QB,
  RESET_ROW_ZOOM,
  RESET_UI_CONTROLS,
  RUN_QUERY,
  SET_DOCUMENT_TITLE,
  SET_DOCUMENT_TITLE_TIMEOUT_ID,
  SET_PARAMETER_VALUE,
  SET_SHOW_LOADING_COMPLETE_FAVICON,
  SET_UI_CONTROLS,
  SHOW_CHART_SETTINGS,
  SOFT_RELOAD_CARD,
  ZOOM_IN_ROW,
} from "metabase/redux/query-builder";
import { clone } from "metabase/utils/clone";
import type { Deferred } from "metabase/utils/promise";
import type {
  Card,
  CollectionItemModel,
  Dataset,
  Field,
  NativeQuerySnippet,
  ParameterValuesMap,
  TimelineEvent,
} from "metabase-types/api";
import type {
  ForeignKeyReference,
  InitialChartSettingState,
  QueryBuilderLoadingControls,
  QueryBuilderParentEntityState,
  QueryBuilderQueryStatus,
  QueryBuilderUIControls,
  Range,
} from "metabase-types/store";

import {
  API_CREATE_QUESTION,
  CLEAR_OBJECT_DETAIL_FK_REFERENCES,
  DESELECT_TIMELINE_EVENTS,
  HIDE_TIMELINE_EVENTS,
  LOAD_OBJECT_DETAIL_FK_REFERENCES,
  OPEN_DATA_REFERENCE_AT_QUESTION,
  RELOAD_CARD,
  SELECT_TIMELINE_EVENTS,
  SET_CARD_AND_RUN,
  SET_CURRENT_STATE,
  SET_DATA_REFERENCE_STACK,
  SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR,
  SET_METADATA_DIFF,
  SET_MODAL_SNIPPET,
  SET_NATIVE_EDITOR_SELECTED_RANGE,
  SET_SNIPPET_COLLECTION_ID,
  SHOW_TIMELINE_EVENTS,
  TOGGLE_DATA_REFERENCE,
  TOGGLE_SNIPPET_SIDEBAR,
  TOGGLE_TEMPLATE_TAGS_EDITOR,
  UPDATE_QUESTION,
} from "./actions";
import {
  CLOSED_NATIVE_EDITOR_SIDEBARS,
  DEFAULT_LOADING_CONTROLS,
  DEFAULT_PARENT_ENTITY_STATE,
  DEFAULT_QUERY_STATUS,
  DEFAULT_UI_CONTROLS,
  UI_CONTROLS_SIDEBAR_DEFAULTS,
} from "./defaults";

function setUIControls(
  state: QueryBuilderUIControls,
  changes: Partial<QueryBuilderUIControls>,
): QueryBuilderUIControls {
  const { queryBuilderMode: currentQBMode, ...currentState } = state;
  const { queryBuilderMode: nextQBMode, ...nextStateChanges } = changes;

  const isChangingQBMode = nextQBMode && currentQBMode !== nextQBMode;
  const isOpeningEditingQBMode = isChangingQBMode && nextQBMode !== "view";

  const queryBuilderMode = nextQBMode || currentQBMode;
  // previousQueryBuilderMode is typed as boolean but stores QueryBuilderMode | false in practice
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

export const uiControls = createReducer<QueryBuilderUIControls>(
  DEFAULT_UI_CONTROLS,
  (builder) => {
    builder
      .addCase<
        string,
        { type: string; payload: Partial<QueryBuilderUIControls> }
      >(SET_UI_CONTROLS, (state, action) =>
        setUIControls(state, action.payload),
      )
      .addCase(RESET_UI_CONTROLS, (state) => ({
        ...DEFAULT_UI_CONTROLS,
        isRunning: state.isRunning,
      }))
      .addCase<
        string,
        { type: string; payload: { uiControls: QueryBuilderUIControls } }
      >(INITIALIZE_QB, (state, action) => ({
        ...state,
        ...DEFAULT_UI_CONTROLS,
        ...action.payload.uiControls,
      }))
      .addCase(UPDATE_QUESTION, (state) => ({
        ...state,
        highlightedNativeQueryLineNumbers:
          DEFAULT_UI_CONTROLS.highlightedNativeQueryLineNumbers,
      }))
      .addCase(TOGGLE_DATA_REFERENCE, (state) => ({
        ...state,
        ...CLOSED_NATIVE_EDITOR_SIDEBARS,
        isShowingDataReference: !state.isShowingDataReference,
      }))
      .addCase<
        string,
        { type: string; payload: QueryBuilderUIControls["dataReferenceStack"] }
      >(SET_DATA_REFERENCE_STACK, (state, action) => ({
        ...state,
        dataReferenceStack: action.payload,
      }))
      .addCase<
        string,
        { type: string; payload: QueryBuilderUIControls["dataReferenceStack"] }
      >(OPEN_DATA_REFERENCE_AT_QUESTION, (state, action) =>
        action.payload
          ? {
              ...state,
              dataReferenceStack: action.payload,
              isShowingDataReference: true,
            }
          : state,
      )
      .addCase(TOGGLE_TEMPLATE_TAGS_EDITOR, (state) => ({
        ...state,
        ...CLOSED_NATIVE_EDITOR_SIDEBARS,
        isShowingTemplateTagsEditor: !state.isShowingTemplateTagsEditor,
      }))
      .addCase(TOGGLE_SNIPPET_SIDEBAR, (state) => ({
        ...state,
        ...CLOSED_NATIVE_EDITOR_SIDEBARS,
        isShowingSnippetSidebar: !state.isShowingSnippetSidebar,
        snippetCollectionId: null,
      }))
      .addCase<string, { type: string; isShowingTemplateTagsEditor: boolean }>(
        SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR,
        (state, action) => ({
          ...state,
          ...CLOSED_NATIVE_EDITOR_SIDEBARS,
          isShowingTemplateTagsEditor: action.isShowingTemplateTagsEditor,
        }),
      )
      .addCase<string, { type: string; payload: Range[] }>(
        SET_NATIVE_EDITOR_SELECTED_RANGE,
        (state, action) => ({
          ...state,
          nativeEditorSelectedRange: action.payload,
        }),
      )
      .addCase<
        string,
        {
          type: string;
          payload:
            | NativeQuerySnippet
            | Partial<Omit<NativeQuerySnippet, "id">>
            | null;
        }
      >(SET_MODAL_SNIPPET, (state, action) => ({
        ...state,
        modalSnippet: action.payload,
      }))
      .addCase<
        string,
        { type: string; payload: QueryBuilderUIControls["snippetCollectionId"] }
      >(SET_SNIPPET_COLLECTION_ID, (state, action) => ({
        ...state,
        snippetCollectionId: action.payload,
      }))
      .addCase(CLOSE_QB_NEWB_MODAL, (state) => ({
        ...state,
        isShowingNewbModal: false,
      }))
      .addCase(RUN_QUERY, (state) => ({
        ...state,
        isRunning: true,
        highlightedNativeQueryLineNumbers:
          DEFAULT_UI_CONTROLS.highlightedNativeQueryLineNumbers,
      }))
      .addCase(CANCEL_QUERY, (state) => ({ ...state, isRunning: false }))
      .addCase(QUERY_COMPLETED, (state) => ({ ...state, isRunning: false }))
      .addCase(QUERY_ERRORED, (state) => ({ ...state, isRunning: false }))
      .addCase<string, { type: string; payload: InitialChartSettingState }>(
        SHOW_CHART_SETTINGS,
        (state, action) => ({
          ...state,
          ...UI_CONTROLS_SIDEBAR_DEFAULTS,
          isShowingChartSettingsSidebar: true,
          initialChartSetting: action.payload,
        }),
      )
      .addCase(CANCEL_QUESTION_CHANGES, (state) => ({
        ...state,
        isModifiedFromNotebook: false,
      }))
      .addCase(EDIT_SUMMARY, (state) => ({
        ...state,
        ...UI_CONTROLS_SIDEBAR_DEFAULTS,
        isShowingSummarySidebar: true,
      }))
      .addCase(ON_CLOSE_SUMMARY, (state) => ({
        ...state,
        ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      }))
      .addCase(OPEN_AI_QUESTION_ANALYSIS_SIDEBAR, (state) => ({
        ...state,
        ...UI_CONTROLS_SIDEBAR_DEFAULTS,
        isShowingAIQuestionAnalysisSidebar: true,
      }))
      .addCase(CLOSE_AI_QUESTION_ANALYSIS_SIDEBAR, (state) => ({
        ...state,
        ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      }))
      .addCase<
        string,
        {
          type: string;
          payload:
            | {
                initialChartSettings?: InitialChartSettingState;
                showSidebarTitle?: boolean;
              }
            | undefined;
        }
      >(OPEN_CHART_SETTINGS, (state, action) => {
        const { initialChartSettings, showSidebarTitle = false } =
          action.payload ?? {};
        return {
          ...state,
          ...UI_CONTROLS_SIDEBAR_DEFAULTS,
          isShowingChartSettingsSidebar: true,
          initialChartSetting: initialChartSettings ?? {},
          showSidebarTitle,
        };
      })
      .addCase(CLOSE_CHART_SETTINGS, (state) => ({
        ...state,
        ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      }))
      .addCase(OPEN_CHART_TYPE, (state) => ({
        ...state,
        ...UI_CONTROLS_SIDEBAR_DEFAULTS,
        isShowingChartTypeSidebar: true,
      }))
      .addCase(CLOSE_CHART_TYPE, (state) => ({
        ...state,
        ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      }))
      .addCase(OPEN_QUESTION_INFO, (state) =>
        setUIControls(state, {
          ...UI_CONTROLS_SIDEBAR_DEFAULTS,
          ...CLOSED_NATIVE_EDITOR_SIDEBARS,
          isShowingQuestionInfoSidebar: true,
          queryBuilderMode: "view",
        }),
      )
      .addCase(CLOSE_QUESTION_INFO, (state) => ({
        ...state,
        isShowingQuestionInfoSidebar: false,
      }))
      .addCase(OPEN_QUESTION_SETTINGS, (state) =>
        setUIControls(state, {
          ...(UI_CONTROLS_SIDEBAR_DEFAULTS as Partial<QueryBuilderUIControls>),
          isShowingQuestionSettingsSidebar: true,
          queryBuilderMode: "view",
        } as Partial<QueryBuilderUIControls>),
      )
      .addCase(CLOSE_QUESTION_SETTINGS, (state) => ({
        ...state,
        isShowingQuestionSettingsSidebar: false,
      }))
      .addCase(OPEN_TIMELINES, (state) => ({
        ...state,
        ...UI_CONTROLS_SIDEBAR_DEFAULTS,
        ...CLOSED_NATIVE_EDITOR_SIDEBARS,
        isShowingTimelineSidebar: true,
      }))
      .addCase(CLOSE_TIMELINES, (state) => ({
        ...state,
        ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      }))
      .addCase(CLOSE_SIDEBARS, (state) => ({
        ...state,
        ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      }));
  },
);

export const loadingControls = createReducer<QueryBuilderLoadingControls>(
  DEFAULT_LOADING_CONTROLS,
  (builder) => {
    builder
      .addCase<string, { type: string; payload: string }>(
        SET_DOCUMENT_TITLE,
        (state, action) => ({
          ...state,
          documentTitle: action.payload,
        }),
      )
      .addCase<string, { type: string; payload: boolean }>(
        SET_SHOW_LOADING_COMPLETE_FAVICON,
        (state, action) => ({
          ...state,
          showLoadCompleteFavicon: action.payload,
        }),
      )
      .addCase<string, { type: string; payload: string }>(
        SET_DOCUMENT_TITLE_TIMEOUT_ID,
        (state, action) => ({
          ...state,
          timeoutId: action.payload,
        }),
      );
  },
);

export const queryStatus = createReducer<QueryBuilderQueryStatus>(
  DEFAULT_QUERY_STATUS,
  (builder) => {
    builder
      .addCase(RUN_QUERY, () => "running" as const)
      .addCase(QUERY_COMPLETED, () => "complete" as const)
      .addCase(CANCEL_QUERY, () => "idle" as const);
  },
);

export const zoomedRowObjectId = createReducer<number | string | null>(
  null,
  (builder) => {
    builder
      .addCase<
        string,
        { type: string; payload: { objectId?: number | string } | undefined }
      >(INITIALIZE_QB, (_state, action) => action.payload?.objectId ?? null)
      .addCase<
        string,
        { type: string; payload: { objectId: number | string } }
      >(ZOOM_IN_ROW, (_state, action) => action.payload.objectId)
      .addCase(RESET_ROW_ZOOM, () => null)
      .addCase(RESET_QB, () => null);
  },
);

// a copy of the card being worked on at its last known saved state. if the card is NEW then this should be null.
// NOTE: we use JSON serialization/deserialization to ensure a deep clone of the object which is required
//       because we can't have any links between the active card being modified and the "originalCard" for testing dirtiness
// ALSO: we consistently check for payload.id because an unsaved card has no "originalCard"
export const originalCard = createReducer<Card | null>(null, (builder) => {
  builder
    .addCase<string, { type: string; payload: { originalCard?: Card } }>(
      INITIALIZE_QB,
      (_state, action) =>
        action.payload.originalCard ? clone(action.payload.originalCard) : null,
    )
    .addCase<string, { type: string; payload: Card }>(
      RELOAD_CARD,
      (_state, action) => (action.payload.id ? clone(action.payload) : null),
    )
    .addCase<string, { type: string; payload: { originalCard?: Card } }>(
      SET_CARD_AND_RUN,
      (_state, action) =>
        action.payload.originalCard ? clone(action.payload.originalCard) : null,
    )
    .addCase<string, { type: string; payload: Card }>(
      API_CREATE_QUESTION,
      (_state, action) => clone(action.payload),
    )
    .addCase<string, { type: string; payload: Card }>(
      API_UPDATE_QUESTION,
      (_state, action) => clone(action.payload),
    );
});

// references to FK tables specifically used on the ObjectDetail page.
export const tableForeignKeyReferences = createReducer<Record<
  number,
  ForeignKeyReference
> | null>(null, (builder) => {
  builder
    .addCase<
      string,
      { type: string; payload: Record<number, ForeignKeyReference> }
    >(LOAD_OBJECT_DETAIL_FK_REFERENCES, (_state, action) => action.payload)
    .addCase(CLEAR_OBJECT_DETAIL_FK_REFERENCES, () => null);
});

export const lastRunCard = createReducer<Card | null>(null, (builder) => {
  builder
    .addCase(RESET_QB, () => null)
    .addCase<string, { type: string; payload: { card: Card } }>(
      QUERY_COMPLETED,
      (_state, action) => action.payload.card,
    )
    .addCase(QUERY_ERRORED, () => null);
});

// The results of a query execution. optionally an error if the query fails to complete successfully.
export const queryResults = createReducer<Dataset[] | null>(null, (builder) => {
  builder
    .addCase(RESET_QB, () => null)
    .addCase<string, { type: string; payload: { queryResults: Dataset[] } }>(
      QUERY_COMPLETED,
      (_state, action) => action.payload.queryResults,
    )
    .addCase<string, { type: string; payload: Dataset | null }>(
      QUERY_ERRORED,
      // @ts-expect-error — Draft<Dataset[]> triggers TS2589 due to Dataset's recursive types
      (state, action) => (action.payload ? [action.payload] : state),
    )
    .addCase(CLEAR_QUERY_RESULT, () => null);
});

export const metadataDiff = createReducer<Record<string, Partial<Field>>>(
  {},
  (builder) => {
    builder
      .addCase(RESET_QB, () => ({}))
      .addCase(API_CREATE_QUESTION, () => ({}))
      .addCase(API_UPDATE_QUESTION, () => ({}))
      .addCase<
        string,
        { type: string; payload: { name: string; changes: Partial<Field> } }
      >(SET_METADATA_DIFF, (state, action) => {
        const { name, changes } = action.payload;
        return {
          ...state,
          [name]: state[name] ? merge(state[name], changes) : changes,
        };
      })
      .addCase(CANCEL_QUESTION_CHANGES, () => ({}));
  },
);

// promise used for tracking a query execution in progress. when a query is started we capture this.
export const cancelQueryDeferred = createReducer<Deferred<void> | null>(
  null,
  (builder) => {
    builder
      .addCase<
        string,
        { type: string; payload: { cancelQueryDeferred: Deferred<void> } }
      >(RUN_QUERY, (_state, action) => action.payload.cancelQueryDeferred)
      .addCase(CANCEL_QUERY, () => null)
      .addCase(QUERY_COMPLETED, () => null)
      .addCase(QUERY_ERRORED, () => null);
  },
);

export const queryStartTime = createReducer<number | null>(null, (builder) => {
  builder
    .addCase(RUN_QUERY, () => performance.now())
    .addCase(CANCEL_QUERY, () => null)
    .addCase(QUERY_COMPLETED, () => null)
    .addCase(QUERY_ERRORED, () => null);
});

export const parameterValues = createReducer<ParameterValuesMap>(
  {},
  (builder) => {
    builder
      .addCase<
        string,
        { type: string; payload: { parameterValues: ParameterValuesMap } }
      >(INITIALIZE_QB, (_state, action) => action.payload.parameterValues)
      .addCase<
        string,
        { type: string; payload: { id: string; value: unknown } }
      >(SET_PARAMETER_VALUE, (state, action) => assoc(state, action.payload.id, action.payload.value));
  },
);

export const currentState = createReducer<{
  card: Card;
  cardId?: number;
  serializedCard: string;
} | null>(null, (builder) => {
  builder.addCase<
    string,
    {
      type: string;
      payload: { card: Card; cardId?: number; serializedCard: string };
    }
  >(SET_CURRENT_STATE, (_state, action) => action.payload);
});

export const parentEntity = createReducer<QueryBuilderParentEntityState>(
  DEFAULT_PARENT_ENTITY_STATE,
  (builder) => {
    builder
      .addCase<
        string,
        {
          type: string;
          payload: {
            id: number | string | null;
            model: CollectionItemModel | null;
            name: string | null;
          };
        }
      >(NAVIGATE_TO_NEW_CARD, (_state, action) => ({
        id: action.payload.id,
        model: action.payload.model,
        name: action.payload.name,
        isEditing: false,
      }))
      .addCase<
        string,
        {
          type: string;
          payload: {
            id: number | string | null;
            model: CollectionItemModel | null;
            name: string | null;
          };
        }
      >(EDIT_QUESTION, (_state, action) => ({
        id: action.payload.id,
        model: action.payload.model,
        name: action.payload.name,
        isEditing: true,
      }))
      .addCase(CLOSE_QB, () => DEFAULT_PARENT_ENTITY_STATE);
  },
);

export const visibleTimelineEventIds = createReducer<number[]>(
  [],
  (builder) => {
    builder
      .addCase(INITIALIZE_QB, () => [])
      .addCase<string, { type: string; payload: TimelineEvent[] }>(
        SHOW_TIMELINE_EVENTS,
        (state, action) =>
          _.uniq([...state, ...action.payload.map((event) => event.id)]),
      )
      .addCase<string, { type: string; payload: TimelineEvent[] }>(
        HIDE_TIMELINE_EVENTS,
        (state, action) => {
          const eventIdsToHide = action.payload.map((event) => event.id);
          return state.filter((eventId) => !eventIdsToHide.includes(eventId));
        },
      )
      .addCase<
        string,
        { type: string; payload: { timelineEvent: { id: number } } }
      >(TimelineEvents.actionTypes.CREATE, (state, action) => [
        ...state,
        action.payload.timelineEvent.id,
      ])
      .addCase(RESET_QB, () => []);
  },
);

export const selectedTimelineEventIds = createReducer<number[]>(
  [],
  (builder) => {
    builder
      .addCase(INITIALIZE_QB, () => [])
      .addCase<string, { type: string; payload: TimelineEvent[] | undefined }>(
        SELECT_TIMELINE_EVENTS,
        (_state, action) => (action.payload ?? []).map((e) => e.id),
      )
      .addCase(DESELECT_TIMELINE_EVENTS, () => [])
      .addCase(CLOSE_TIMELINES, () => [])
      .addCase(RESET_QB, () => []);
  },
);

// the card that is actively being worked on
export const card = createReducer<Card | null>(null, (builder) => {
  builder
    .addCase(RESET_QB, () => null)
    .addCase(CLOSE_QB, () => null)
    .addCase<
      string,
      {
        type: string;
        payload: {
          card: Card;
        };
      }
    >(INITIALIZE_QB, (state, action) =>
      action.payload ? action.payload.card : null,
    )
    .addCase<
      string,
      {
        type: string;
        payload: Card;
      }
    >(SOFT_RELOAD_CARD, (state, action) => action.payload)
    .addCase<
      string,
      {
        type: string;
        payload: Card;
      }
    >(RELOAD_CARD, (state, action) => action.payload)
    .addCase<
      string,
      {
        type: string;
        payload: {
          card: Card;
        };
      }
    >(SET_CARD_AND_RUN, (state, action) => action.payload.card)
    .addCase<
      string,
      {
        type: string;
        payload: Card;
      }
    >(API_CREATE_QUESTION, (state, action) => action.payload)
    .addCase<
      string,
      {
        type: string;
        payload: Card;
      }
    >(API_UPDATE_QUESTION, (state, action) => action.payload)
    .addCase<
      string,
      {
        type: string;
        payload: {
          card: Card;
        };
      }
    >(CANCEL_QUESTION_CHANGES, (state, action) => action.payload.card)
    .addCase<
      string,
      {
        type: string;
        payload: {
          card: Card;
        };
      }
    >(UPDATE_QUESTION, (state, action) => action.payload.card)
    .addCase<
      string,
      {
        type: string;
        payload: {
          card: Card;
        };
      }
    >(QUERY_COMPLETED, (state, action) => {
      if (!state) {
        return state;
      }
      return {
        ...state,
        display: action.payload.card.display,
        result_metadata: action.payload.card.result_metadata,
        visualization_settings: action.payload.card.visualization_settings,
      };
    })
    .addMatcher(createCardPublicLink.matchFulfilled, (state, action) => {
      if (!state) {
        return state;
      }
      return {
        ...state,
        public_uuid: action.payload.uuid,
      };
    })
    .addMatcher(deleteCardPublicLink.matchFulfilled, (state) => {
      if (!state) {
        return state;
      }

      return {
        ...state,
        public_uuid: null,
      };
    })
    .addMatcher(updateCardEnableEmbedding.matchFulfilled, (state, action) => {
      if (!state) {
        return state;
      }
      return {
        ...state,
        enable_embedding: action.payload.enable_embedding,
      };
    })
    .addMatcher(updateCardEmbeddingParams.matchFulfilled, (state, action) => {
      if (!state) {
        return state;
      }

      return {
        ...state,
        embedding_params: action.payload.embedding_params,
        initially_published_at: action.payload.initially_published_at,
      };
    });
});
