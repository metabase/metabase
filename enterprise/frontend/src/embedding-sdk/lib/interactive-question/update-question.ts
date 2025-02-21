import _ from "underscore";

import type { SdkQuestionState } from "embedding-sdk/types/question";
import type { Deferred } from "metabase/lib/promise";
import { computeQuestionPivotTable } from "metabase/query_builder/actions/core/pivot-table";
import { getAdHocQuestionWithVizSettings } from "metabase/query_builder/actions/core/utils";
import { createRawSeries } from "metabase/query_builder/utils";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Dispatch, GetState } from "metabase-types/store";

import { runQuestionQuerySdk } from "./run-question-query";

interface UpdateQuestionParams {
  previousQuestion: Question;
  nextQuestion: Question;
  originalQuestion?: Question;
  shouldStartAdHocQuestion?: boolean;
  queryResults?: any[];
  cancelDeferred?: Deferred;

  /** Optimistic update the question in the query builder UI */
  optimisticUpdateQuestion: (question: Question) => void;

  /** Whether to run the query by default? */
  shouldRunQueryOnQuestionChange?: boolean;
}

export const updateQuestionSdk =
  (params: UpdateQuestionParams) =>
  async (dispatch: Dispatch, getState: GetState): Promise<SdkQuestionState> => {
    let {
      previousQuestion,
      nextQuestion,
      originalQuestion,
      shouldStartAdHocQuestion = true,
      cancelDeferred,
      queryResults,
      optimisticUpdateQuestion: onQuestionChange,
      shouldRunQueryOnQuestionChange = false,
    } = params;

    nextQuestion = getAdHocQuestionWithVizSettings({
      question: nextQuestion,
      currentQuestion: previousQuestion,
      shouldStartAdHocQuestion,
    });

    if (!nextQuestion.canAutoRun()) {
      shouldRunQueryOnQuestionChange = false;
    }

    nextQuestion = nextQuestion.applyTemplateTagParameters();

    const rawSeries = createRawSeries({
      question: nextQuestion,
      queryResult: queryResults?.[0],
      datasetQuery: undefined,
    });

    const computedPivotQuestion = computeQuestionPivotTable({
      question: nextQuestion,
      currentQuestion: previousQuestion,
      rawSeries,
    });

    nextQuestion = computedPivotQuestion.question;

    if (computedPivotQuestion.shouldRun !== null) {
      shouldRunQueryOnQuestionChange = computedPivotQuestion.shouldRun;
    }

    // Optimistic update the UI before we re-fetch the query metadata.
    onQuestionChange(nextQuestion);

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
    nextQuestion = new Question(nextQuestion.card(), metadata);

    // In most cases, we only update the question when the query change.
    // We don't usually run the query right away unless specified.
    if (shouldRunQueryOnQuestionChange) {
      return runQuestionQuerySdk({
        question: nextQuestion,
        originalQuestion,
        cancelDeferred,
      });
    }

    return { question: nextQuestion };
  };
