import _ from "underscore";

import { loadMetadataForCard } from "metabase/questions/actions";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Dispatch } from "metabase-types/store";

interface Options {
  query: Lib.Query;
  question: Question;
  dispatch: Dispatch;
}

export async function updateQuestion(options: Options) {
  const { query, question, dispatch } = options;

  if (!question) {
    return;
  }

  const nextQuestion = question.setQuery(query);

  const currentDependencies = question
    ? Lib.dependentMetadata(question.query(), question.id(), question.type())
    : [];

  const nextDependencies = Lib.dependentMetadata(
    nextQuestion.query(),
    nextQuestion.id(),
    nextQuestion.type(),
  );

  if (!_.isEqual(currentDependencies, nextDependencies)) {
    await dispatch(loadMetadataForCard(nextQuestion.card()));
  }

  // eslint-disable-next-line no-console
  console.log("Update question:", { question, query });

  return nextQuestion;
}
