import NativeQuery from "metabase-lib/queries/NativeQuery";
import Question from "metabase-lib/Question";

export const fillQuestionTemplateTags = (question: Question) => {
  const query = question.query();

  if (!(query instanceof NativeQuery)) {
    return question;
  }

  const queryText = query.queryText();

  return query.setQueryText(queryText).question();
};
