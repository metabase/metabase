import { Card } from "metabase-types/api";
import Metadata from "metabase-lib/metadata/Metadata";
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

export const getMetabotQuestionResults = async (
  card: Card,
  metadata: Metadata,
) => {
  const question = fillQuestionTemplateTags(new Question(card, metadata));
  const results = await question.apiGetResults();
  return { question, results };
};
