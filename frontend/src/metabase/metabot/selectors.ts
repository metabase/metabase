import { createSelector } from "reselect";
import { getMetadata } from "metabase/selectors/metadata";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import { maybeGetNativeQueryText } from "./utils";

export const getEntityId = (state: State) => {
  return state.metabot.entityId;
};

export const getEntityType = (state: State) => {
  return state.metabot.entityType;
};

export const getQuestion = (state: State) => {
  const card = state.metabot.card;
  return card ? new Question(card, getMetadata(state)) : null;
};

export const getOriginalQuestion = (state: State) => {
  const card = state.metabot.originalCard;
  return card ? new Question(card, getMetadata(state)) : null;
};

export const getPrompt = (state: State) => {
  return state.metabot.prompt;
};

export const getQueryStatus = (state: State) => {
  return state.metabot.queryStatus;
};

export const getQueryResults = (state: State) => {
  return state.metabot.queryResults;
};

export const hasQueryResults = (state: State) => {
  return getQueryResults(state) != null;
};

export const getQueryError = (state: State) => {
  return state.metabot.queryError;
};

export const getFeedbackType = (state: State) => {
  return state.metabot.feedbackType;
};

export const getFeedbackStatus = (state: State) => {
  return state.metabot.feedbackStatus;
};

export const getNativeQueryText = createSelector([getQuestion], question =>
  maybeGetNativeQueryText(question),
);

export const getOriginalNativeQueryText = createSelector(
  [getOriginalQuestion],
  question => maybeGetNativeQueryText(question),
);
