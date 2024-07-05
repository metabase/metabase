import _ from "underscore";

import type { SdkQuestionResult } from "embedding-sdk/types/question";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { syncVizSettingsWithSeries } from "metabase/visualizations/lib/sync-settings";
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
