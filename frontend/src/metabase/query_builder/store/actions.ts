import { createAction } from "redux-actions";

import {
  NAVIGATE_BACK_TO_DASHBOARD,
  RESET_QB,
} from "metabase/redux/query-builder";
import type { ParameterId, ParameterValueOrArray } from "metabase-types/api";

export const RESET_UI_CONTROLS = "metabase/qb/RESET_UI_CONTROLS";
export const resetUIControls = createAction(RESET_UI_CONTROLS);

export const navigateBackToDashboard = createAction(NAVIGATE_BACK_TO_DASHBOARD);

export const CLOSE_QB = "metabase/qb/CLOSE_QB";
export const closeQB = createAction(CLOSE_QB);

export const SHOW_CHART_SETTINGS = "metabase/qb/SHOW_CHART_SETTINGS";
export const showChartSettings = createAction(SHOW_CHART_SETTINGS);

export const CANCEL_QUESTION_CHANGES = "metabase/qb/CANCEL_QUESTION_CHANGES";

export const ON_CLOSE_SUMMARY = "metabase/qb/ON_CLOSE_SUMMARY";
export const onCloseSummary = createAction(ON_CLOSE_SUMMARY);

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

export const resetQB = createAction(RESET_QB);

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
