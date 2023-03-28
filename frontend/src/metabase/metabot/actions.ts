import { createAction } from "redux-actions";

export const SET_QUERY_TEXT = "metabase/metabot/SET_QUERY_TEXT";
export const setQueryText = createAction(SET_QUERY_TEXT);

export const SET_FEEDBACK_TYPE = "metabase/metabot/SET_FEEDBACK_TYPE";
export const setFeedbackType = createAction(SET_FEEDBACK_TYPE);
