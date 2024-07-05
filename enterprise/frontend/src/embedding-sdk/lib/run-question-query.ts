import _ from "underscore";

import type {
  LoadSdkQuestionParams,
  NavigateToNewCardParams,
  SdkQuestionResult,
} from "embedding-sdk/types/question";
import { loadCard } from "metabase/lib/card";
import { defer } from "metabase/lib/promise";
import * as Urls from "metabase/lib/urls";
import {
  parseHash,
  resolveCards,
  deserializeCard,
} from "metabase/query_builder/actions";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { runQuestionQuery } from "metabase/services";
import { syncVizSettingsWithSeries } from "metabase/visualizations/lib/sync-settings";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { cardIsEquivalent } from "metabase-lib/v1/queries/utils/card";
import type { Dispatch, GetState } from "metabase-types/store";

interface RunQuestionQueryParams {
  question: Question;
  originalQuestion?: Question;
}

interface RunQuestionOnQueryChangeParams {
  previousQuestion: Question;
  nextQuestion: Question;
  originalQuestion?: Question;
  shouldStartAdHocQuestion?: boolean;
  queryResults?: any[];
}

interface RunQuestionOnNavigateParams extends NavigateToNewCardParams {
  originalQuestion?: Question;
}

export async function runQuestionQuerySdk(
  params: RunQuestionQueryParams,
): Promise<SdkQuestionResult> {
  let { question, originalQuestion } = params;

  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  if (question.isSaved()) {
    const type = question.type();

    if (type === "question") {
      question = question.lockDisplay();
    }
  }

  const isQueryDirty = originalQuestion
    ? question.isQueryDirtyComparedTo(originalQuestion)
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

  return { question, originalQuestion, queryResults };
}

export const runQuestionOnLoadSdk =
  ({ location, params }: LoadSdkQuestionParams) =>
  async (
    dispatch: Dispatch,
    getState: GetState,
  ): Promise<SdkQuestionResult> => {
    const cardId = Urls.extractEntityId(params.slug);
    const { options, serializedCard } = parseHash(location.hash);

    const { card, originalCard } = await resolveCards({
      cardId,
      options,
      dispatch,
      getState,
      deserializedCard: serializedCard && deserializeCard(serializedCard),
    });

    await dispatch(loadMetadataForCard(card));
    const metadata = getMetadata(getState());

    return runQuestionQuerySdk({
      question: new Question(card, metadata),
      originalQuestion: originalCard && new Question(originalCard, metadata),
    });
  };

export const runQuestionOnQueryChangeSdk =
  (params: RunQuestionOnQueryChangeParams) =>
  async (
    dispatch: Dispatch,
    getState: GetState,
  ): Promise<SdkQuestionResult> => {
    let {
      previousQuestion,
      nextQuestion,
      originalQuestion,
      queryResults,
      shouldStartAdHocQuestion = true,
    } = params;

    const { isEditable } = Lib.queryDisplayInfo(nextQuestion.query());

    const shouldTurnIntoAdHoc =
      shouldStartAdHocQuestion && nextQuestion.isSaved() && isEditable;

    if (shouldTurnIntoAdHoc) {
      nextQuestion = nextQuestion.withoutNameAndId();

      // When the dataset query changes, we should change the question type,
      // to start building a new ad-hoc question based on a dataset
      // NOTE: we do not support model and metric questions in the SDK yet.
      if (nextQuestion.type() === "model" || nextQuestion.type() === "metric") {
        nextQuestion = nextQuestion.setType("question");
      }
    }

    if (queryResults) {
      const [queryResult] = queryResults;

      nextQuestion = nextQuestion.setSettings(
        syncVizSettingsWithSeries(nextQuestion.settings(), [
          {
            card: nextQuestion.card(),
            data: queryResult?.data,
            error: queryResult?.error,
          },
        ]),
      );
    }

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
      originalQuestion,
    });
  };

export const runQuestionOnNavigateSdk =
  (params: RunQuestionOnNavigateParams) =>
  async (
    dispatch: Dispatch,
    getState: GetState,
  ): Promise<SdkQuestionResult | null> => {
    let { nextCard, previousCard, originalQuestion } = params;

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
      runQuestionOnQueryChangeSdk({
        previousQuestion,
        nextQuestion,
        originalQuestion,
      }),
    );

    return result as SdkQuestionResult;
  };
