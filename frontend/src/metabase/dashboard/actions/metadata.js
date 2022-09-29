import { loadMetadataForQueries } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";

import Question from "metabase-lib/lib/Question";

import { isVirtualDashCard } from "../utils";

export const loadMetadataForDashboard = dashCards => (dispatch, getState) => {
  const metadata = getMetadata(getState());

  const questions = dashCards
    .filter(dc => !isVirtualDashCard(dc) && dc.card.dataset_query) // exclude text cards and queries without perms
    .flatMap(dc => [dc.card].concat(dc.series || []))
    .map(card => new Question(card, metadata));

  return dispatch(
    loadMetadataForQueries(
      questions.map(question => question.query()),
      questions.map(question => question.dependentMetadata()),
    ),
  );
};
