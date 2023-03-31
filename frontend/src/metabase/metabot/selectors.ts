import { createSelector } from "reselect";
import { getMetadata } from "metabase/selectors/metadata";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";

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

export const getPrompt = (state: State) => {
  return state.metabot.prompt;
};

export const getQueryStatus = (state: State) => {
  return state.metabot.queryStatus;
};

export const getIsQueryRunning = createSelector(
  [getQueryStatus],
  status => status === "running",
);

export const getQueryResults = (state: State) => {
  return state.metabot.queryResults;
};

export const getQueryError = (state: State) => {
  return state.metabot.queryError;
};

export const getFeedbackType = (state: State) => {
  return state.metabot.feedbackType;
};

export const getPromptTemplateVersions = (state: State) =>
  state.metabot.promptTemplateVersions;

export const getCancelQueryDeferred = (state: State) => {
  return state.metabot.cancelQueryDeferred;
};
