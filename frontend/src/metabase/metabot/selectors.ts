import { createSelector } from "reselect";
import { getMetadata } from "metabase/selectors/metadata";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import NativeQuery from "metabase-lib/queries/NativeQuery";
import { DEFAULT_TABLE_SETTINGS } from "./constants";

export const getEntityId = (state: State) => {
  return state.metabot.entityId;
};

export const getEntityType = (state: State) => {
  return state.metabot.entityType;
};

export const getCard = (state: State) => {
  return state.metabot.card;
};

export const getQuestion = createSelector(
  [getCard, getMetadata],
  (card, metadata) => {
    return card ? new Question(card, metadata) : undefined;
  },
);

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

export const getQueryResultsError = createSelector(
  [getQueryResults],
  results => {
    return results?.find(result => result.error)?.error;
  },
);

export const getQueryError = (state: State) => {
  return state.metabot.queryError;
};

export const getFeedbackType = (state: State) => {
  return state.metabot.feedbackType;
};

export const getNativeQueryText = createSelector([getQuestion], question => {
  const query = question?.query();
  return query instanceof NativeQuery ? query.queryText() : undefined;
});

export const getPromptTemplateVersions = (state: State) =>
  state.metabot.promptTemplateVersions;

export const getCancelQueryDeferred = (state: State) => {
  return state.metabot.cancelQueryDeferred;
};

export const getUiControls = (state: State) => {
  return state.metabot.uiControls;
};

export const getIsShowingRawTable = (state: State) => {
  return getUiControls(state).isShowingRawTable;
};

export const getIsVisualized = createSelector([getQuestion], question => {
  return (
    question != null &&
    question.display() !== "table" &&
    question.display() !== "pivot"
  );
});

export const getRawSeries = createSelector(
  [getQuestion, getQueryResults, getIsShowingRawTable],
  (question, results, isRawTable) => {
    if (question && results) {
      const card = isRawTable
        ? question
            .setDisplay("table")
            .setSettings(DEFAULT_TABLE_SETTINGS)
            .card()
        : question.card();

      return question.atomicQueries().map((_, index) => ({
        card,
        data: results[index]?.data,
      }));
    }
  },
);
