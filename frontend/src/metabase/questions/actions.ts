import { loadMetadataForDependentItems } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";

import type { Card } from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/Question";

export interface LoadMetadataOptions {
  reload?: boolean;
}

export const loadMetadataForCard =
  (card: Card, options?: LoadMetadataOptions) =>
  (dispatch: Dispatch, getState: GetState) => {
    const question = new Question(card, getMetadata(getState()));
    const queries =
      question.type() === "question"
        ? [question.query()]
        : [question.query(), question.composeDataset().query()];
    const dependencies = [
      ...question.dependentMetadata(),
      ...queries.flatMap(query => Lib.dependentMetadata(query)),
    ];
    return dispatch(loadMetadataForDependentItems(dependencies, options));
  };
