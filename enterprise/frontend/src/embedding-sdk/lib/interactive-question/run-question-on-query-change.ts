import _ from "underscore";

import type { SdkQuestionResult } from "embedding-sdk/types/question";
import type { Deferred } from "metabase/lib/promise";
import { getAdHocQuestionWithVizSettings } from "metabase/query_builder/actions/core/utils";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Dispatch, GetState } from "metabase-types/store";

import { runQuestionQuerySdk } from "./run-question-query";

interface RunQuestionOnQueryChangeParams {
  previousQuestion: Question;
  nextQuestion: Question;
  originalQuestion?: Question;
  shouldStartAdHocQuestion?: boolean;
  queryResults?: any[];
  cancelDeferred?: Deferred;
}

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
      cancelDeferred,
    } = params;

    nextQuestion = getAdHocQuestionWithVizSettings({
      question: nextQuestion,
      queryResult: queryResults?.[0],
      shouldStartAdHocQuestion,
    });

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
      cancelDeferred,
    });
  };
