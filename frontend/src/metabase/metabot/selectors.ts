import { getMetadata } from "metabase/selectors/metadata";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";

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

export const getQueryText = (state: State) => {
  return state.metabot.queryText;
};

export const getQueryStatus = (state: State) => {
  return state.metabot.queryStatus;
};

export const getQueryResults = (state: State) => {
  return state.metabot.queryResults;
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
