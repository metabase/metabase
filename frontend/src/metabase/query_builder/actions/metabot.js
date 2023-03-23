import { MetabotApi } from "metabase/services";
import { getOriginalQuestion } from "metabase/query_builder/selectors";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/Question";
import { updateQuestion } from "./core";
import { runQuestionQuery } from "./querying";

export const runNaturalLanguageQuery = query => async (dispatch, getState) => {
  const question = getOriginalQuestion(getState());
  const newCard = await MetabotApi.modelPrompt({
    id: question.id(),
    question: query,
  });
  const newQuestion = new Question(newCard, getMetadata(getState()));
  await dispatch(updateQuestion(newQuestion));
  await dispatch(runQuestionQuery({ shouldUpdateUrl: false }));
};
