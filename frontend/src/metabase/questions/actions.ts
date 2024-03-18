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
    // 1 - metadata which can be inferred from the query
    await loadMetadata(card, options);
    // 2 - additional metadata such as FK tables
    await loadMetadata(card);

    const question = new Question(card, getMetadata(getState()));
    if (question.type() !== "question") {
      const adhocCard = question.composeQueryAdHoc().card();

      // 3 - additional metadata for ad-hoc questions based on this question
      await loadMetadata(adhocCard);
      // 4 - additional metadata for metadata overrides
      await loadMetadata(adhocCard);
    }
  };

const loadMetadata =
  (card: Card, options?: LoadMetadataOptions) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const question = new Question(card, getMetadata(getState()));
    const dependencies = Lib.dependentMetadata(question.query());
    await dispatch(loadMetadataForDependentItems(dependencies, options));
  };
