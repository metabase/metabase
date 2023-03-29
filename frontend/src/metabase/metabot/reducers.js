import { handleActions } from "redux-actions";
import {
  FETCH_CARD,
  FETCH_QUERY_RESULTS,
  QUERY_COMPLETED,
  QUERY_ERRORED,
  RESET,
  RUN_QUERY,
  UPDATE_QUESTION,
  UPDATE_PROMPT,
  SUBMIT_FEEDBACK,
  INIT,
  UPDATE_FEEDBACK_TYPE,
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
    [UPDATE_QUESTION]: { next: (state, { payload }) => payload },
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
    [INIT]: { next: (state, { payload }) => payload.initialPrompt ?? "" },
    [UPDATE_PROMPT]: { next: (state, { payload }) => payload },
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
    [RUN_QUERY]: { next: () => null },
    [FETCH_QUERY_RESULTS]: { next: (state, { payload }) => payload },
    [RESET]: { next: () => null },
  },
  null,
);

export const queryError = handleActions(
  {
    [QUERY_ERRORED]: { next: (state, { payload }) => payload },
    [RESET]: { next: () => null },
  },
  null,
);

export const feedbackType = handleActions(
  {
    [RUN_QUERY]: { next: () => null },
    [UPDATE_FEEDBACK_TYPE]: { next: (state, { payload }) => payload },
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
