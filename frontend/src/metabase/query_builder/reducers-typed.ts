import { createReducer } from "@reduxjs/toolkit";

import {
  createCardPublicLink,
  deleteCardPublicLink,
  updateCardEmbeddingParams,
  updateCardEnableEmbedding,
} from "metabase/api";
import type { Card, DatasetQuery } from "metabase-types/api";
import type { QueryBuilderUIControls } from "metabase-types/store";

import {
  API_CREATE_QUESTION,
  API_UPDATE_QUESTION,
  CANCEL_QUERY,
  CANCEL_QUESTION_CHANGES,
  INITIALIZE_QB,
  QUERY_COMPLETED,
  QUERY_ERRORED,
  RELOAD_CARD,
  RESET_QB,
  RUN_QUERY,
  SET_CARD_AND_RUN,
  SOFT_RELOAD_CARD,
  UPDATE_QUESTION,
  closeQbNewbModal,
  initializeQBAction,
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
  openDataReferenceAtQuestion,
  resetUIControls,
  setDataReferenceStack,
  setIsShowingTemplateTagsEditor,
  setModalSnippet,
  setNativeEditorSelectedRange,
  setSnippetCollectionId,
  setUIControls as setUIControlsAction,
  showChartSettings,
  toggleDataReference,
  toggleSnippetSidebar,
  toggleTemplateTagsEditor,
} from "./actions";

// the card that is actively being worked on
export const card = createReducer<Card<DatasetQuery> | null>(null, builder => {
  builder
    .addCase(RESET_QB, () => null)
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
    .addMatcher(deleteCardPublicLink.matchFulfilled, state => {
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

const DEFAULT_UI_CONTROLS: QueryBuilderUIControls = {
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
  queryBuilderMode: null, // "view" | "notebook" | "dataset"
  previousQueryBuilderMode: null,
  snippetCollectionId: null,
  datasetEditorTab: "query",
  isShowingSnippetSidebar: false,
  isShowingQuestionDetailsSidebar: false,
  isShowingQuestionSettingsSidebar: false,
  modalSnippet: null,
  isShowingNotebookNativePreview: false,
  notebookNativePreviewSidebarWidth: null,
  nativeEditorSelectedRange: null,
  showSidebarTitle: false,
};

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

function setUIControls(
  currentQBMode: QueryBuilderUIControls["queryBuilderMode"],
  previousQueryBuilderMode: QueryBuilderUIControls["previousQueryBuilderMode"],
  nextQBMode?: QueryBuilderUIControls["queryBuilderMode"] | null,
  otherChanges = {},
) {
  const isChangingQBMode = nextQBMode && currentQBMode !== nextQBMode;
  const isOpeningEditingQBMode = isChangingQBMode && nextQBMode !== "view";

  const newQueryBuilderMode = nextQBMode || currentQBMode;
  const newPreviousQueryBuilderMode = isChangingQBMode
    ? currentQBMode
    : previousQueryBuilderMode;

  // Close all the sidebars when entering notebook/dataset QB modes
  const extraState = isOpeningEditingQBMode ? UI_CONTROLS_SIDEBAR_DEFAULTS : {};

  return {
    ...extraState,
    ...otherChanges,
    queryBuilderMode: newQueryBuilderMode,
    previousQueryBuilderMode: newPreviousQueryBuilderMode,
  };
}

export const uiControls = createReducer(DEFAULT_UI_CONTROLS, builder => {
  builder
    .addCase(setUIControlsAction, (state, { payload }) => ({
      ...state,
      ...setUIControls(
        state.queryBuilderMode,
        state.previousQueryBuilderMode,
        payload?.queryBuilderMode,
        payload,
      ),
    }))
    .addCase(resetUIControls, () => DEFAULT_UI_CONTROLS)
    .addCase(initializeQBAction, (state, { payload }) => ({
      ...state,
      ...DEFAULT_UI_CONTROLS,
      ...CLOSED_NATIVE_EDITOR_SIDEBARS,
      ...payload.uiControls,
    }))
    .addCase(toggleDataReference, state => ({
      ...state,
      ...CLOSED_NATIVE_EDITOR_SIDEBARS,
      isShowingDataReference: !state.isShowingDataReference,
    }))
    .addCase(setDataReferenceStack, (state, { payload }) => ({
      ...state,
      dataReferenceStack: payload,
    }))
    .addCase(openDataReferenceAtQuestion.fulfilled, (state, { payload }) =>
      payload
        ? {
            ...state,
            dataReferenceStack: payload,
            isShowingDataReference: true,
          }
        : state,
    )
    .addCase(toggleTemplateTagsEditor, state => ({
      ...state,
      ...CLOSED_NATIVE_EDITOR_SIDEBARS,
      isShowingTemplateTagsEditor: !state.isShowingTemplateTagsEditor,
    }))
    .addCase(toggleSnippetSidebar, state => ({
      ...state,
      ...CLOSED_NATIVE_EDITOR_SIDEBARS,
      isShowingSnippetSidebar: !state.isShowingSnippetSidebar,
      snippetCollectionId: null,
    }))
    .addCase(setIsShowingTemplateTagsEditor, (state, { payload }) => {
      return {
        ...state,
        ...CLOSED_NATIVE_EDITOR_SIDEBARS,
        isShowingTemplateTagsEditor: payload.isShowingTemplateTagsEditor,
      };
    })
    .addCase(setNativeEditorSelectedRange, (state, { payload }) => ({
      ...state,
      nativeEditorSelectedRange: payload,
    }))
    .addCase(setModalSnippet, (state, { payload }) => ({
      ...state,
      modalSnippet: payload,
    }))
    .addCase(setSnippetCollectionId, (state, { payload }) => ({
      ...state,
      snippetCollectionId: payload,
    }))
    .addCase(closeQbNewbModal.fulfilled, state => ({
      ...state,
      isShowingNewbModal: false,
    }))
    .addCase(RUN_QUERY, state => ({
      ...state,
      isRunning: true,
    }))
    .addCase(CANCEL_QUERY, state => ({
      ...state,
      isRunning: false,
    }))
    .addCase(QUERY_COMPLETED, state => ({
      ...state,
      isRunning: false,
    }))
    .addCase(QUERY_ERRORED, state => ({
      ...state,
      isRunning: false,
    }))
    .addCase(showChartSettings, (state, { payload }) => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      isShowingChartSettingsSidebar: true,
      initialChartSetting: payload,
    }))
    .addCase(onEditSummary, state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      isShowingSummarySidebar: true,
    }))
    .addCase(onCloseSummary, state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
    }))
    .addCase(
      onOpenChartSettings,
      (
        state,
        {
          payload: {
            initialChartSetting = null,
            showSidebarTitle = false,
          } = {},
        },
      ) => ({
        ...state,
        ...UI_CONTROLS_SIDEBAR_DEFAULTS,
        isShowingChartSettingsSidebar: true,
        initialChartSetting,
        showSidebarTitle,
      }),
    )
    .addCase(onCloseChartSettings, state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
    }))
    .addCase(onOpenChartType, state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      isShowingChartTypeSidebar: true,
    }))
    .addCase(onCloseChartType, state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
    }))
    .addCase(onOpenQuestionInfo, state => ({
      ...state,
      ...setUIControls(
        state.queryBuilderMode,
        state.previousQueryBuilderMode,
        null,
        {
          ...UI_CONTROLS_SIDEBAR_DEFAULTS,
          ...{
            isShowingQuestionInfoSidebar: true,
            queryBuilderMode: "view",
          },
        },
      ),
    }))
    .addCase(onCloseQuestionInfo, state => ({
      ...state,
      isShowingQuestionInfoSidebar: false,
    }))
    .addCase(onOpenQuestionSettings, state => {
      return {
        ...state,
        ...setUIControls(
          state.queryBuilderMode,
          state.previousQueryBuilderMode,
          null,
          {
            ...UI_CONTROLS_SIDEBAR_DEFAULTS,
            isShowingQuestionSettingsSidebar: true,
            queryBuilderMode: "view",
          },
        ),
      };
    })
    .addCase(onCloseQuestionSettings, state => ({
      ...state,
      isShowingQuestionSettingsSidebar: false,
    }))
    .addCase(onOpenTimelines, state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
      ...CLOSED_NATIVE_EDITOR_SIDEBARS,
      isShowingTimelineSidebar: true,
    }))
    .addCase(onCloseTimelines, state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
    }))
    .addCase(onCloseSidebars, state => ({
      ...state,
      ...UI_CONTROLS_SIDEBAR_DEFAULTS,
    }));
});
