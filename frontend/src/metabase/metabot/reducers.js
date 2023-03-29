import { handleActions } from "redux-actions";
import {
  FETCH_CARD,
  FETCH_QUERY_RESULTS,
  QUERY_COMPLETED,
  RESET,
  RUN_QUERY,
  SET_CARD,
  SET_ENTITY_ID,
  SET_ENTITY_TYPE,
  SET_FEEDBACK_TYPE,
  SET_PROMPT,
  SUBMIT_FEEDBACK,
} from "./actions";

export const entityId = handleActions(
  {
    [SET_ENTITY_ID]: { next: (state, { payload }) => payload },
    [RESET]: { next: () => null },
  },
  null,
);

export const entityType = handleActions(
  {
    [SET_ENTITY_TYPE]: { next: (state, { payload }) => payload },
    [RESET]: { next: () => null },
  },
  null,
);

export const card = handleActions(
  {
    [SET_CARD]: { next: (state, { payload }) => payload },
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

export const prompt = handleActions(
  {
    [SET_PROMPT]: { next: (state, { payload }) => payload },
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
    [RUN_QUERY]: { next: () => null },
    [SET_FEEDBACK_TYPE]: { next: (state, { payload }) => payload },
    [RESET]: { next: () => null },
  },
  null,
);

export const feedbackStatus = handleActions(
  {
    [RUN_QUERY]: { next: () => "idle" },
    [SUBMIT_FEEDBACK]: { next: () => "complete" },
    [RESET]: { next: () => "idle" },
  },
  "idle",
);
