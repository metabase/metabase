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

  // TODO: do we need this at all?
  //       what does "locking display to prevent auto-selection" mean?
  if (question.isSaved()) {
    const type = question.type();

    if (type === "question") {
      question = question.lockDisplay();
    }
  }

  const cancelQueryDeferred = defer();

  const isQueryDirty = originalQuestion
    ? question.isQueryDirtyComparedTo(new Question(originalQuestion))
    : true;

  let queryResults;

  if (question.canRun() && (question.isSaved() || !isNative)) {
    queryResults = await runQuestionQuery(question, {
      cancelDeferred: cancelQueryDeferred,
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
  (question: Question, nextQuestion: Question) =>
  async (dispatch: Dispatch, getState: GetState): Promise<Result> => {
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

    const metadata = getMetadata(getState());

    const runResult = await runQuestionQuerySdk({
      question: new Question(nextQuestion.card(), metadata),
    });

    // TODO: to remove
    // eslint-disable-next-line no-console
    console.log("Update Question:", { question, nextQuestion });

    return runResult;
  };

export const runQuestionQueryOnNavigateSdk =
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

    const question = new Question(previousCard, metadata);
    const nextQuestion = new Question(nextCard, metadata);

    const result = await dispatch(
      runQuestionOnQueryChangeSdk(question, nextQuestion),
    );

    return result as Result;
  };
