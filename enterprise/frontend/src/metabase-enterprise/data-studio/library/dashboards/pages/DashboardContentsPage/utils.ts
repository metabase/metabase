import _ from "underscore";

import type { Card, UnreadableCard } from "metabase-types/api";
import { isReadableCard } from "metabase-types/guards/card";

/**
 * The dashboard's contents: each distinct saved card it shows, in order. Text,
 * heading, link, iframe and action dashcards show no card, so they are not
 * contents, and neither is a card the user cannot read.
 */
export function getDashboardContentItems(
  cards: readonly (Card | UnreadableCard)[],
): Card[] {
  return _.uniq(cards.filter(isReadableCard), (card) => card.id);
}
