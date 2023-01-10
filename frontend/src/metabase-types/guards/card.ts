import { Card, SavedCard } from "metabase-types/types/Card";

export function isSavedCard(card: Card): card is SavedCard {
  return !!(card as SavedCard).id;
}
