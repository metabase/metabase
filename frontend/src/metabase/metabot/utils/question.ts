import NativeQuery from "metabase-lib/queries/NativeQuery";
import Question from "metabase-lib/Question";

export const maybeGetNativeQueryText = (question: Question) => {
  const query = question.query();
  if (!(query instanceof NativeQuery)) {
    return undefined;
  }

  return query.queryText();
};

const fillQuestionTemplateTags = (question: Question) => {
  const query = question.query();

  if (!(query instanceof NativeQuery)) {
    return question;
  }

  const queryText = query.queryText();

  return query.setQueryText(queryText).question();
};

export const fetchResults = async (question: Question) => {
  const newQuestion = fillQuestionTemplateTags(question);
  const results = await newQuestion.apiGetResults();
  return { question: newQuestion, results };
};
