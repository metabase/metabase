import { loadMetadataForDependentItems } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
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
    const dependencies = question.dependentMetadata();
    await dispatch(loadMetadataForDependentItems(dependencies, options));

    // metadata for ad-hoc questions based on this question
    if (question.isSaved() && question.type() !== "question") {
      const adhocQuestion = question.composeQuestionAdhoc();
      const adhocDependencies = adhocQuestion.dependentMetadata();
      await dispatch(loadMetadataForDependentItems(adhocDependencies, options));
    }
  };
