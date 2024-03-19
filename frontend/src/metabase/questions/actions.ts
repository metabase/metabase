import { loadMetadataForDependentItems } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

export interface LoadMetadataOptions {
  reload?: boolean;
}

export const loadMetadataForCard =
  (card: Card, options?: LoadMetadataOptions) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const question = new Question(card, getMetadata(getState()));
    const dependencies = Lib.dependentMetadata(question.query());
    await dispatch(loadMetadataForDependentItems(dependencies, options));

    // metadata for an ad-hoc question based on this question
    if (question.isSaved() && question.type() !== "question") {
      const questionWithMetadata = new Question(card, getMetadata(getState()));
      const adhocQuestion = questionWithMetadata.composeQuestionAdhoc();
      const adhocDependencies = Lib.dependentMetadata(adhocQuestion.query());
      await dispatch(loadMetadataForDependentItems(adhocDependencies, options));
    }
  };
