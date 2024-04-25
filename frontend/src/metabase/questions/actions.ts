import { loadMetadataForDependentItems } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { Card } from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

export interface LoadMetadataOptions {
  reload?: boolean;
}

export const loadMetadataForCard =
  (card: Card, options?: LoadMetadataOptions) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const question = new Question(card, getMetadata(getState()));
    const loadAdhocMetadata =
      question.isSaved() && question.type() !== "question";
    const dependencies = [...Lib.dependentMetadata(question.query())];
    if (loadAdhocMetadata) {
      const tableId = getQuestionVirtualTableId(question.id());
      dependencies.push({ id: tableId, type: "table" });
    }
    await dispatch(loadMetadataForDependentItems(dependencies, options));

    if (loadAdhocMetadata) {
      const questionWithMetadata = new Question(card, getMetadata(getState()));
      const adhocQuestion = questionWithMetadata.composeQuestionAdhoc();
      const adhocDependencies = Lib.dependentMetadata(adhocQuestion.query());
      await dispatch(loadMetadataForDependentItems(adhocDependencies, options));
    }
  };
