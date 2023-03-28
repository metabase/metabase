import { handleActions } from "redux-actions";
import { SET_QUERY_TEXT, SET_FEEDBACK_TYPE } from "./actions";

export const entityId = handleActions({}, null);

export const entityType = handleActions({}, null);

export const card = handleActions({}, null);

export const originalCard = handleActions({}, null);

export const queryText = handleActions(
  {
    [SET_QUERY_TEXT]: { next: (state, { payload }) => payload },
  },
  "",
);

export const queryStatus = handleActions({}, "idle");

export const queryResults = handleActions({}, null);

export const queryError = handleActions({}, null);

export const feedbackType = handleActions(
  {
    [SET_FEEDBACK_TYPE]: { next: (state, { payload }) => payload },
  },
  null,
);

export const feedbackStatus = handleActions({}, null);
