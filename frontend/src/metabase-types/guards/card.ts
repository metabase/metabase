import { Card, UnsavedCard } from "metabase-types/api";

export function isSavedCard(card: Card | UnsavedCard): card is Card {
  return !!(card as Card).id;
}
