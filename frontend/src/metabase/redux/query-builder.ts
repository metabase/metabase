import { createAction } from "redux-actions";

import { UserApi } from "metabase/services";
import { createThunkAction } from "metabase/utils/redux";
import { checkNotNull } from "metabase/utils/types";
import type { ParameterId, ParameterValueOrArray } from "metabase-types/api";

export const SET_UI_CONTROLS = "metabase/qb/SET_UI_CONTROLS";
export const setUIControls = createAction(SET_UI_CONTROLS);

export const RESET_UI_CONTROLS = "metabase/qb/RESET_UI_CONTROLS";
export const resetUIControls = createAction(RESET_UI_CONTROLS);

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

export const CLOSE_QB_NEWB_MODAL = "metabase/qb/CLOSE_QB_NEWB_MODAL";
export const closeQbNewbModal = createThunkAction(CLOSE_QB_NEWB_MODAL, () => {
  return async (_dispatch, getState) => {
    const { currentUser } = getState();
    await UserApi.update_qbnewb({ id: checkNotNull(currentUser).id });
  };
});
