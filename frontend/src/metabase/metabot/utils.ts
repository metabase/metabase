import Question from "metabase-lib/Question";
import NativeQuery from "metabase-lib/queries/NativeQuery";

export const maybeFixTemplateTags = (question: Question) => {
  const query = question.query();

  if (!(query instanceof NativeQuery)) {
    return question;
  }

  const queryText = query.queryText();
  return query.setQueryText(queryText).question();
};
