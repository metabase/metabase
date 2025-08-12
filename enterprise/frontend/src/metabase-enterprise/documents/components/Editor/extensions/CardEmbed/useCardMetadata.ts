import { useEffect } from "react";
import _ from "underscore";

import { useDispatch } from "metabase/lib/redux";
import { loadMetadataForCard } from "metabase/questions/actions";
import type { Card } from "metabase-types/api";

/**
 * Custom hook to load metadata for a card.
 * Handles both regular cards (id > 0) and draft cards (id < 0).
 * For draft cards, removes the id so loadMetadataForCard uses the adhoc metadata path.
 */
export const useCardMetadata = (card: Card | undefined, isOpen = true) => {
  const dispatch = useDispatch();

  useEffect(() => {
    if (isOpen && card) {
      // For draft cards (id < 0), omit the id so isSavedCard returns false
      const cardForMetadata = card.id < 0 ? _.omit(card, "id") : card;
      dispatch(loadMetadataForCard(cardForMetadata));
    }
  }, [isOpen, card, dispatch]);
};
