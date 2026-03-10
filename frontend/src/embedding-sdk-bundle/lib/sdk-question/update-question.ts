import _ from "underscore";

import type { SdkQuestionState } from "embedding-sdk-bundle/types/question";
import type { Deferred } from "metabase/lib/promise";
import { computeQuestionPivotTable } from "metabase/query_builder/actions/core/pivot-table";
import { getAdHocQuestionWithVizSettings } from "metabase/query_builder/actions/core/utils";
import { createRawSeries } from "metabase/query_builder/utils";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { ParameterValuesMap } from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";
import type { Dispatch, GetState } from "metabase-types/store";

import { runQuestionQuerySdk } from "./run-question-query";

interface UpdateQuestionParams {
  previousQuestion: Question;
  nextQuestion: Question;
  originalQuestion?: Question;
  nextParameterValues: ParameterValuesMap;

  /**
   * When the question change is due to a drill thru action, it must be set to `true`
   * It includes everything that calls the `dataset` endpoint that accepts the `query` in payload:
   * - drills when clicking in a visualization
   * - filters
   * - breakouts
   *
   * For cases when the update change must call the `query` endpoint, it must be set to `false`:
   * - sql parameters change
   **/
  shouldStartAdHocQuestion: boolean;

  queryResults?: any[];
  cancelDeferred?: Deferred;
  isGuestEmbed: boolean;
  token: EntityToken | null | undefined;

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
      nextParameterValues,
      shouldStartAdHocQuestion,
      cancelDeferred,
      queryResults,
      optimisticUpdateQuestion: onQuestionChange,
      shouldRunQueryOnQuestionChange = false,
      isGuestEmbed,
      token,
    } = params;

    nextQuestion = getAdHocQuestionWithVizSettings({
      question: nextQuestion,
      currentQuestion: previousQuestion,
      shouldStartAdHocQuestion,
    });

    if (!isGuestEmbed && !nextQuestion.canAutoRun()) {
      shouldRunQueryOnQuestionChange = false;
    }

    nextQuestion = nextQuestion.applyTemplateTagParameters();

    const rawSeries = createRawSeries({
      card: nextQuestion.card(),
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
      // TODO: should be uncommented when implementing https://linear.app/metabase/issue/EMB-190/add-the-query-run-button-to-the-embedding-sdk
      // shouldRunQueryOnQuestionChange = computedPivotQuestion.shouldRun;
      shouldRunQueryOnQuestionChange = true;
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
      await dispatch(loadMetadataForCard(nextQuestion.card(), { token }));
    }

    const metadata = getMetadata(getState());
    nextQuestion = new Question(
      nextQuestion.card(),
      metadata,
      nextParameterValues,
    );

    // In most cases, we only update the question when the query change.
    // We don't usually run the query right away unless specified.
    if (shouldRunQueryOnQuestionChange) {
      return runQuestionQuerySdk({
        question: nextQuestion,
        isGuestEmbed,
        token,
        originalQuestion,
        parameterValues: nextParameterValues,
        cancelDeferred,
      });
    }

    return { question: nextQuestion };
  };
