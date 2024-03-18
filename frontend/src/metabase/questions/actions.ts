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
    // metadata which can be inferred from the query - source table, joined tables
    await dispatch(loadMetadata(card, options));
    // additional metadata - target FK fields and tables
    await dispatch(loadMetadata(card));

    // metadata for ad-hoc questions based on this question
    const question = new Question(card, getMetadata(getState()));
    if (question.type() !== "question") {
      const adhocCard = question.composeQuestionAdHoc().card();
      await dispatch(loadMetadataForCard(adhocCard));
    }
  };

const loadMetadata =
  (card: Card, options?: LoadMetadataOptions) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const question = new Question(card, getMetadata(getState()));
    const dependencies = Lib.dependentMetadata(question.query());
    await dispatch(loadMetadataForDependentItems(dependencies, options));
  };
