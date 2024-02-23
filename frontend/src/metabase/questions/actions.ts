import { loadMetadataForQueries } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/Question";
import type { Card } from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

export interface LoadMetadataOptions {
  reload?: boolean;
}

export const loadMetadataForCard =
  (card: Card, options?: LoadMetadataOptions) =>
  (dispatch: Dispatch, getState: GetState) => {
    const metadata = getMetadata(getState());
    const question = new Question(card, metadata);
    const queries = [question.legacyQuery({ useStructuredQuery: true })];
    if (question.isDataset()) {
      queries.push(
        question.composeDataset().legacyQuery({ useStructuredQuery: true }),
      );
    }
    return dispatch(
      loadMetadataForQueries(queries, question.dependentMetadata(), options),
    );
  };
