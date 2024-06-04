import type { Card, UnsavedCard, XrayCard } from "metabase-types/api";

export function isSavedCard(card: Card | UnsavedCard | XrayCard): card is Card {
  return "id" in card && typeof card.id === "number";
}
