/**
 * The query builder's action types, and the action creators light enough to sit
 * next to them.
 *
 * The types live here rather than beside their thunks so that
 * `query_builder/reducers.ts` can name them without importing
 * `query_builder/actions`. The store imports that reducer on every page, and
 * anything it reaches is in the initial bundle.
 */
import { createAction } from "redux-actions";

import { userApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { createThunkAction } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import { checkNotNull } from "metabase/utils/types";
import type { ParameterId, ParameterValueOrArray } from "metabase-types/api";

export const SET_UI_CONTROLS = "metabase/qb/SET_UI_CONTROLS";
export const setUIControls = createAction(SET_UI_CONTROLS);

export const RESET_UI_CONTROLS = "metabase/qb/RESET_UI_CONTROLS";
export const resetUIControls = createAction(RESET_UI_CONTROLS);

export const SET_IS_NATIVE_EDITOR_OPEN =
  "metabase/qb/SET_IS_NATIVE_EDITOR_OPEN";
export const setIsNativeEditorOpen = createThunkAction(
  SET_IS_NATIVE_EDITOR_OPEN,
  (isNativeEditorOpen: boolean, toggleDataReference?: boolean) =>
    (dispatch) => {
      if (toggleDataReference) {
        dispatch(
          setUIControls({
            isNativeEditorOpen,
            isShowingDataReference: isNativeEditorOpen,
          }),
        );
      } else {
        dispatch(setUIControls({ isNativeEditorOpen }));
      }
    },
);

export const NAVIGATE_BACK_TO_DASHBOARD =
  "metabase/qb/NAVIGATE_BACK_TO_DASHBOARD";
export const navigateBackToDashboard = createAction(NAVIGATE_BACK_TO_DASHBOARD);

export const CLOSE_QB = "metabase/qb/CLOSE_QB";
export const closeQB = createAction(CLOSE_QB);

export const SHOW_CHART_SETTINGS = "metabase/qb/SHOW_CHART_SETTINGS";
export const showChartSettings = createAction(SHOW_CHART_SETTINGS);

export const CANCEL_QUESTION_CHANGES = "metabase/qb/CANCEL_QUESTION_CHANGES";

export const EDIT_SUMMARY = "metabase/qb/EDIT_SUMMARY";
export const editSummary = createAction(EDIT_SUMMARY);

export const ON_CLOSE_SUMMARY = "metabase/qb/ON_CLOSE_SUMMARY";
export const onCloseSummary = createAction(ON_CLOSE_SUMMARY);

export const OPEN_AI_QUESTION_ANALYSIS_SIDEBAR =
  "metabase/qb/OPEN_AI_QUESTION_ANALYSIS_SIDEBAR";
export const onOpenAIQuestionAnalysisSidebar = createAction(
  OPEN_AI_QUESTION_ANALYSIS_SIDEBAR,
);

export const CLOSE_AI_QUESTION_ANALYSIS_SIDEBAR =
  "metabase/qb/CLOSE_AI_QUESTION_ANALYSIS_SIDEBAR";
export const onCloseAIQuestionAnalysisSidebar = createAction(
  CLOSE_AI_QUESTION_ANALYSIS_SIDEBAR,
);

export const OPEN_CHART_SETTINGS = "metabase/qb/OPEN_CHART_SETTINGS";
export const onOpenChartSettings = createAction(OPEN_CHART_SETTINGS);

export const CLOSE_CHART_SETTINGS = "metabase/qb/CLOSE_CHART_SETTINGS";
export const onCloseChartSettings = createAction(CLOSE_CHART_SETTINGS);

export const OPEN_CHART_TYPE = "metabase/qb/OPEN_CHART_TYPE";
export const onOpenChartType = createAction(OPEN_CHART_TYPE);

export const OPEN_QUESTION_INFO = "metabase/qb/OPEN_QUESTION_INFO";
export const onOpenQuestionInfo = createAction(OPEN_QUESTION_INFO);

export const CLOSE_QUESTION_INFO = "metabase/qb/CLOSE_QUESTION_INFO";
export const onCloseQuestionInfo = createAction(CLOSE_QUESTION_INFO);

export const OPEN_QUESTION_SETTINGS = "metabase/qb/OPEN_QUESTION_SETTINGS";
export const onOpenQuestionSettings = createAction(OPEN_QUESTION_SETTINGS);

export const CLOSE_QUESTION_SETTINGS = "metabase/qb/CLOSE_QUESTION_SETTINGS";
export const onCloseQuestionSettings = createAction(CLOSE_QUESTION_SETTINGS);

export const OPEN_TIMELINES = "metabase/qb/OPEN_TIMELINES";
export const onOpenTimelines = createAction(OPEN_TIMELINES);

export const CLOSE_TIMELINES = "metabase/qb/CLOSE_TIMELINES";
export const onCloseTimelines = createAction(CLOSE_TIMELINES);

export const CLOSE_CHART_TYPE = "metabase/qb/CLOSE_CHART_TYPE";
export const onCloseChartType = createAction(CLOSE_CHART_TYPE);

export const CLOSE_SIDEBARS = "metabase/qb/CLOSE_SIDEBARS";
export const onCloseSidebars = createAction(CLOSE_SIDEBARS);

export const CLEAR_QUERY_RESULT = "metabase/query_builder/CLEAR_QUERY_RESULT";
export const clearQueryResult = createAction(CLEAR_QUERY_RESULT);

export const SET_DOCUMENT_TITLE = "metabase/qb/SET_DOCUMENT_TITLE";
export const SET_SHOW_LOADING_COMPLETE_FAVICON =
  "metabase/qb/SET_SHOW_LOADING_COMPLETE_FAVICON";
export const SET_DOCUMENT_TITLE_TIMEOUT_ID =
  "metabase/qb/SET_DOCUMENT_TITLE_TIMEOUT_ID";

export const RUN_QUERY = "metabase/qb/RUN_QUERY";
export const QUERY_COMPLETED = "metabase/qb/QUERY_COMPLETED";
export const QUERY_ERRORED = "metabase/qb/QUERY_ERRORED";
export const CANCEL_QUERY = "metabase/qb/CANCEL_QUERY";

export const SOFT_RELOAD_CARD = "metabase/qb/SOFT_RELOAD_CARD";
export const API_UPDATE_QUESTION = "metabase/qb/API_UPDATE_QUESTION";

export const RESET_QB = "metabase/qb/RESET_QB";
export const resetQB = createAction(RESET_QB);

export const REVERT_CARD_TO_REVISION = "metabase/qb/REVERT_CARD_TO_REVISION";

export const SET_PARAMETER_VALUE = "metabase/qb/SET_PARAMETER_VALUE";
export const setParameterValue = createAction(
  SET_PARAMETER_VALUE,
  (parameterId: ParameterId, value: ParameterValueOrArray | null) => {
    return { id: parameterId, value: normalizeValue(value) };
  },
);

function normalizeValue(
  value: ParameterValueOrArray | null,
): ParameterValueOrArray | null {
  if (value === "") {
    return null;
  }

  if (Array.isArray(value) && value.length === 0) {
    return null;
  }

  return value;
}

export const INITIALIZE_QB = "metabase/qb/INITIALIZE_QB";

export const ZOOM_IN_ROW = "metabase/qb/ZOOM_IN_ROW";
export const RESET_ROW_ZOOM = "metabase/qb/RESET_ROW_ZOOM";

export const API_CREATE_QUESTION = "metabase/qb/API_CREATE_QUESTION";
export const CLEAR_OBJECT_DETAIL_FK_REFERENCES =
  "metabase/qb/CLEAR_OBJECT_DETAIL_FK_REFERENCES";
export const DESELECT_TIMELINE_EVENTS = "metabase/qb/DESELECT_TIMELINE_EVENTS";
export const HIDE_TIMELINE_EVENTS = "metabase/qb/HIDE_TIMELINE_EVENTS";
export const LOAD_OBJECT_DETAIL_FK_REFERENCES =
  "metabase/qb/LOAD_OBJECT_DETAIL_FK_REFERENCES";
export const OPEN_DATA_REFERENCE_AT_QUESTION =
  "metabase/qb/OPEN_DATA_REFERENCE_AT_QUESTION";
export const RELOAD_CARD = "metabase/qb/RELOAD_CARD";
export const SELECT_TIMELINE_EVENTS = "metabase/qb/SELECT_TIMELINE_EVENTS";
export const SET_CARD_AND_RUN = "metabase/qb/SET_CARD_AND_RUN";
export const SET_CURRENT_STATE = "metabase/qb/SET_CURRENT_STATE";
export const SET_DATA_REFERENCE_STACK = "metabase/qb/SET_DATA_REFERENCE_STACK";
export const SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR =
  "metabase/qb/SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR";
export const SET_METADATA_DIFF = "metabase/qb/SET_METADATA_DIFF";
export const SET_MODAL_SNIPPET = "metabase/qb/SET_MODAL_SNIPPET";
export const SET_NATIVE_EDITOR_SELECTED_RANGE =
  "metabase/qb/SET_NATIVE_EDITOR_SELECTED_RANGE";
export const SET_SNIPPET_COLLECTION_ID =
  "metabase/qb/SET_SNIPPET_COLLECTION_ID";
export const SHOW_TIMELINE_EVENTS = "metabase/qb/SHOW_TIMELINE_EVENTS";
export const TOGGLE_DATA_REFERENCE = "metabase/qb/TOGGLE_DATA_REFERENCE";
export const TOGGLE_SNIPPET_SIDEBAR = "metabase/qb/TOGGLE_SNIPPET_SIDEBAR";
export const TOGGLE_TEMPLATE_TAGS_EDITOR =
  "metabase/qb/TOGGLE_TEMPLATE_TAGS_EDITOR";
export const UPDATE_QUESTION = "metabase/qb/UPDATE_QUESTION";

export const CLOSE_QB_NEWB_MODAL = "metabase/qb/CLOSE_QB_NEWB_MODAL";
export const closeQbNewbModal = createThunkAction(CLOSE_QB_NEWB_MODAL, () => {
  return async (dispatch, getState) => {
    const user = checkNotNull(getUser(getState()));
    await runRtkEndpoint(
      user.id,
      dispatch,
      userApi.endpoints.updateUserModalQbnewb,
    );
  };
});
