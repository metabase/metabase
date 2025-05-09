import type { Card, UnsavedCard, VirtualCard } from "metabase-types/api";

export function isSavedCard(
  card: Card | UnsavedCard | VirtualCard,
): card is Card {
  return "id" in card && card.id != null;
}
