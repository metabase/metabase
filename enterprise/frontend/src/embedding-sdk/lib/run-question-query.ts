import _ from "underscore";

import type {
  NavigateToNewCardParams,
  SdkQuestionResult as Result,
} from "embedding-sdk/types/question";
import { loadCard } from "metabase/lib/card";
import { defer } from "metabase/lib/promise";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { runQuestionQuery } from "metabase/services";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { cardIsEquivalent } from "metabase-lib/v1/queries/utils/card";
import type { Dispatch, GetState } from "metabase-types/store";

interface Options {
  question: Question;
  originalQuestion?: Question;
}

export async function runQuestionQuerySdk(options: Options): Promise<Result> {
  let { question, originalQuestion } = options;

  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  if (question.isSaved()) {
    const type = question.type();

    if (type === "question") {
      question = question.lockDisplay();
    }
  }

  const isQueryDirty = originalQuestion
    ? question.isQueryDirtyComparedTo(new Question(originalQuestion))
    : true;

  let queryResults;

  if (question.canRun() && (question.isSaved() || !isNative)) {
    queryResults = await runQuestionQuery(question, {
      cancelDeferred: defer(), // TODO: support query cancellation in the SDK
      ignoreCache: false,
      isDirty: isQueryDirty,
    });
  }

  // FIXME: this removes "You can also get an alert when there are some results." feature for question
  if (question) {
    question.alertType = () => null;
  }

  return { question, queryResults };
}

export const runQuestionOnQueryChangeSdk =
  (previousQuestion: Question, nextQuestion: Question) =>
  async (dispatch: Dispatch, getState: GetState): Promise<Result> => {
    const currentDependencies = previousQuestion
      ? Lib.dependentMetadata(
          previousQuestion.query(),
          previousQuestion.id(),
          previousQuestion.type(),
        )
      : [];

    const nextDependencies = Lib.dependentMetadata(
      nextQuestion.query(),
      nextQuestion.id(),
      nextQuestion.type(),
    );

    if (!_.isEqual(currentDependencies, nextDependencies)) {
      await dispatch(loadMetadataForCard(nextQuestion.card()));
    }

    const metadata = getMetadata(getState());

    return runQuestionQuerySdk({
      question: new Question(nextQuestion.card(), metadata),
    });
  };

export const runQuestionOnNavigateSdk =
  (options: NavigateToNewCardParams) =>
  async (dispatch: Dispatch, getState: GetState): Promise<Result | null> => {
    let { nextCard, previousCard } = options;

    // Do not reload questions with breakouts when clicking on a legend item
    if (previousCard === nextCard) {
      return null;
    }

    const metadata = getMetadata(getState());

    // Fallback when a visualization legend is clicked
    if (cardIsEquivalent(previousCard, nextCard)) {
      nextCard = await loadCard(nextCard.id, { dispatch, getState });
    }

    const previousQuestion = new Question(previousCard, metadata);
    const nextQuestion = new Question(nextCard, metadata);

    const result = await dispatch(
      runQuestionOnQueryChangeSdk(previousQuestion, nextQuestion),
    );

    return result as Result;
  };
