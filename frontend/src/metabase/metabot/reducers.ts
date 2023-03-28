import { handleActions } from "redux-actions";
import { SET_QUERY_TEXT, SET_FEEDBACK_TYPE, RESET } from "./actions";

export const entityId = handleActions(
  {
    [RESET]: { next: () => null },
  },
  null,
);

export const entityType = handleActions(
  {
    [RESET]: { next: () => null },
  },
  null,
);

export const card = handleActions(
  {
    [RESET]: { next: () => null },
  },
  null,
);

export const originalCard = handleActions(
  {
    [RESET]: { next: () => null },
  },
  null,
);

export const queryText = handleActions(
  {
    [SET_QUERY_TEXT]: { next: (state, { payload }) => payload },
    [RESET]: { next: () => "" },
  },
  "",
);

export const queryStatus = handleActions(
  {
    [RESET]: { next: () => "idle" },
  },
  "idle",
);

export const queryResults = handleActions(
  {
    [RESET]: { next: () => null },
  },
  null,
);

export const queryError = handleActions(
  {
    [RESET]: { next: () => null },
  },
  null,
);

export const feedbackType = handleActions(
  {
    [SET_FEEDBACK_TYPE]: { next: (state, { payload }) => payload },
    [RESET]: { next: () => null },
  },
  null,
);

export const feedbackStatus = handleActions(
  {
    [RESET]: { next: () => "idle" },
  },
  "idle",
);
