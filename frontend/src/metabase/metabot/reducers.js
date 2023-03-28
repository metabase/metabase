import { handleActions } from "redux-actions";
import {
  FETCH_CARD,
  FETCH_QUERY_RESULTS,
  INIT,
  QUERY_COMPLETED,
  RESET,
  RUN_QUERY,
  SET_FEEDBACK_TYPE,
  SET_QUERY_TEXT,
} from "./actions";

export const entityId = handleActions(
  {
    [INIT]: { next: (state, { payload }) => payload.entityId },
    [RESET]: { next: () => null },
  },
  null,
);

export const entityType = handleActions(
  {
    [INIT]: { next: (state, { payload }) => payload.entityType },
    [RESET]: { next: () => null },
  },
  null,
);

export const card = handleActions(
  {
    [FETCH_CARD]: { next: (state, { payload }) => payload },
    [RESET]: { next: () => null },
  },
  null,
);

export const originalCard = handleActions(
  {
    [FETCH_CARD]: { next: (state, { payload }) => payload },
    [RESET]: { next: () => null },
  },
  null,
);

export const queryText = handleActions(
  {
    [INIT]: { next: (state, { payload }) => payload.initialQueryText },
    [SET_QUERY_TEXT]: { next: (state, { payload }) => payload },
    [RESET]: { next: () => "" },
  },
  "",
);

export const queryStatus = handleActions(
  {
    [RUN_QUERY]: { next: () => "running" },
    [QUERY_COMPLETED]: { next: () => "complete" },
    [RESET]: { next: () => "idle" },
  },
  "idle",
);

export const queryResults = handleActions(
  {
    [FETCH_QUERY_RESULTS]: { next: (state, { payload }) => payload },
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
