import { handleActions } from "redux-actions";
import {
  FETCH_CARD,
  FETCH_QUERY_RESULTS,
  RESET,
  SET_ENTITY_ID,
  SET_ENTITY_TYPE,
  SET_FEEDBACK_TYPE,
  SET_QUERY_STATUS,
  SET_QUERY_TEXT,
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
    [SET_QUERY_TEXT]: { next: (state, { payload }) => payload },
    [RESET]: { next: () => "" },
  },
  "",
);

export const queryStatus = handleActions(
  {
    [SET_QUERY_STATUS]: { next: (state, { payload }) => payload },
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
