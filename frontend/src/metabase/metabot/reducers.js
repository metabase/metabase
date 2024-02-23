import { handleActions } from "redux-actions";

import {
  FETCH_QUERY_RESULTS,
  FETCH_QUESTION,
  INIT,
  RESET,
  RUN_PROMPT_QUERY,
  RUN_PROMPT_QUERY_FULFILLED,
  RUN_PROMPT_QUERY_REJECTED,
  RUN_QUESTION_QUERY,
  RUN_QUESTION_QUERY_FULFILLED,
  RUN_QUESTION_QUERY_REJECTED,
  SUBMIT_FEEDBACK_FORM,
  UPDATE_PROMPT,
  UPDATE_QUESTION,
  CANCEL_QUERY,
  SET_UI_CONTROLS,
} from "./actions";
import { DEFAULT_UI_CONTROLS } from "./constants";

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
    [FETCH_QUESTION]: { next: (state, { payload }) => payload.card },
    [UPDATE_QUESTION]: { next: (state, { payload }) => payload },
    [RUN_PROMPT_QUERY]: { next: () => null },
    [RESET]: { next: () => null },
  },
  null,
);

export const promptTemplateVersions = handleActions(
  {
    [FETCH_QUESTION]: {
      next: (state, { payload }) => payload.prompt_template_versions,
    },
    [RUN_PROMPT_QUERY]: { next: () => null },
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
    [RUN_PROMPT_QUERY]: { next: () => "running" },
    [RUN_PROMPT_QUERY_FULFILLED]: { next: () => "complete" },
    [RUN_PROMPT_QUERY_REJECTED]: { next: () => "complete" },
    [RUN_QUESTION_QUERY]: { next: () => "running" },
    [RUN_QUESTION_QUERY_FULFILLED]: { next: () => "complete" },
    [RUN_QUESTION_QUERY_REJECTED]: { next: () => "complete" },
    [CANCEL_QUERY]: { next: () => "idle" },
    [RESET]: { next: () => "idle" },
  },
  "idle",
);

export const queryResults = handleActions(
  {
    [RUN_PROMPT_QUERY]: { next: () => null },
    [FETCH_QUERY_RESULTS]: { next: (state, { payload }) => payload },
    [CANCEL_QUERY]: { next: () => null },
    [RESET]: { next: () => null },
  },
  null,
);

export const queryError = handleActions(
  {
    [RUN_PROMPT_QUERY_REJECTED]: { next: (state, { payload }) => payload },
    [RUN_QUESTION_QUERY_REJECTED]: { next: (state, { payload }) => payload },
    [RESET]: { next: () => null },
    [CANCEL_QUERY]: { next: () => null },
    [RUN_PROMPT_QUERY]: { next: () => null },
    [RUN_QUESTION_QUERY]: { next: () => null },
  },
  null,
);

export const feedbackType = handleActions(
  {
    [RUN_PROMPT_QUERY]: { next: () => null },
    [SUBMIT_FEEDBACK_FORM]: { next: (state, { payload }) => payload },
    [CANCEL_QUERY]: { next: () => null },
    [RESET]: { next: () => null },
  },
  null,
);

export const cancelQueryDeferred = handleActions(
  {
    [RUN_PROMPT_QUERY]: {
      next: (state, { payload: cancelQueryDeferred }) => cancelQueryDeferred,
    },
    [RUN_QUESTION_QUERY]: {
      next: (state, { payload: cancelQueryDeferred }) => cancelQueryDeferred,
    },
    [CANCEL_QUERY]: { next: () => null },
    [RUN_PROMPT_QUERY_FULFILLED]: { next: () => null },
    [RUN_PROMPT_QUERY_REJECTED]: { next: () => null },
    [RUN_QUESTION_QUERY_FULFILLED]: { next: () => null },
    [RUN_QUESTION_QUERY_REJECTED]: { next: () => null },
  },
  null,
);

export const uiControls = handleActions(
  {
    [RUN_PROMPT_QUERY]: { next: () => DEFAULT_UI_CONTROLS },
    [SET_UI_CONTROLS]: {
      next: (state, { payload }) => ({ ...state, ...payload }),
    },
    [RESET]: { next: () => DEFAULT_UI_CONTROLS },
  },
  DEFAULT_UI_CONTROLS,
);
