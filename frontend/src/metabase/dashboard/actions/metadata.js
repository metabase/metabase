import Questions from "metabase/entities/questions";
import { getLinkTargets } from "metabase/lib/click-behavior";
import { loadMetadataForCards } from "metabase/questions/actions";

import { isVirtualDashCard } from "../utils";

export const loadMetadataForDashcards = dashCards => async dispatch => {
  const cards = dashCards
    .filter(dc => !isVirtualDashCard(dc)) // exclude text cards
    .flatMap(dc => [dc.card].concat(dc.series || []));

  await Promise.all([
    dispatch(loadMetadataForAvailableCards(cards)),
    dispatch(loadMetadataForLinkedTargets(dashCards)),
  ]);
};

const loadMetadataForAvailableCards = cards => dispatch => {
  // exclude queries without perms
  const availableCards = cards.filter(card => card.dataset_query);
  return dispatch(loadMetadataForCards(availableCards));
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

    await dispatch(loadMetadataForAvailableCards(cards));
  };
