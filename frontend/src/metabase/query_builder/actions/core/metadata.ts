import _ from "underscore";

import { loadMetadataForQueries } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";

import Question from "metabase-lib/lib/Question";

import { Card } from "metabase-types/types/Card";
import { Dispatch, GetState } from "metabase-types/store";

export const loadMetadataForCard = (card: Card) => (
  dispatch: Dispatch,
  getState: GetState,
) => {
  const metadata = getMetadata(getState());
  const question = new Question(card, metadata);
  const queries = [question.query()];
  if (question.isDataset()) {
    queries.push(question.composeDataset().query());
  }
  return dispatch(
    loadMetadataForQueries(queries, question.dependentMetadata()),
  );
};
