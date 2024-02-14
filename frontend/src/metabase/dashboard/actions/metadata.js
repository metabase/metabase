import Questions from "metabase/entities/questions";
import { getMetadata } from "metabase/selectors/metadata";
import { loadMetadataForDependentItems } from "metabase/redux/metadata";
import { getLinkTargets } from "metabase/lib/click-behavior";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/Question";
import { isVirtualDashCard } from "../utils";

export const loadMetadataForDashboard = dashCards => async dispatch => {
  const cards = dashCards
    .filter(dc => !isVirtualDashCard(dc)) // exclude text cards
    .flatMap(dc => [dc.card].concat(dc.series || []));

  await Promise.all([
    dispatch(loadMetadataForCards(cards)),
    dispatch(loadMetadataForLinkedTargets(dashCards)),
  ]);
};

const loadMetadataForCards = cards => (dispatch, getState) => {
  const metadata = getMetadata(getState());

  const questions = cards
    .filter(card => card.dataset_query) // exclude queries without perms
    .map(card => new Question(card, metadata));

  const dependentItems = questions.flatMap(question => [
    ...question.dependentMetadata(),
    ...Lib.dependentMetadata(question.query()),
  ]);

  return dispatch(loadMetadataForDependentItems(dependentItems));
};

const loadMetadataForLinkedTargets =
  dashCards => async (dispatch, getState) => {
    const linkTargets = dashCards.flatMap(card =>
      getLinkTargets(card.visualization_settings),
    );
    const fetchRequests = linkTargets
      .map(({ entity, entityId }) =>
        entity.actions.fetch({ id: entityId }, { noEvent: true }),
      )
      .map(action => dispatch(action).catch(e => console.error(e)));

    await Promise.all(fetchRequests);

    const cards = linkTargets
      .filter(({ entityType }) => entityType === "question")
      .map(({ entityId }) =>
        Questions.selectors.getObject(getState(), { entityId })?.card(),
      )
      .filter(card => card != null);

    await dispatch(loadMetadataForCards(cards));
  };
