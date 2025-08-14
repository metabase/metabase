import type { Card, UnsavedCard } from "metabase-types/api";

export function isSavedCard(card: Card | UnsavedCard): card is Card {
  return (
    "id" in card &&
    card.id != null &&
    // if a card id is negative is a temporary card in a document
    ((typeof card.id === "number" && card.id > 0) ||
      // card ids may also be entity ids here
      typeof card.id === "string")
  );
}
