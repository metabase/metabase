import * as Urls from "metabase/urls";
import { isQuestionDashCard } from "metabase/utils/dashboard";
import type {
  Card,
  CardId,
  Dashboard,
  UnreadableCard,
} from "metabase-types/api";
import { isReadableCard } from "metabase-types/guards/dashboard";

/**
 * The cards a dashboard's question dashcards show, series included, in
 * dashcard order and as the API sends them, so a card the user cannot read is
 * a bare `{ id }`.
 */
export function getDashcardCards(
  dashboard: Pick<Dashboard, "dashcards">,
): (Card | UnreadableCard)[] {
  return dashboard.dashcards
    .filter(isQuestionDashCard)
    .flatMap((dashcard) => [dashcard.card, ...(dashcard.series ?? [])]);
}

/**
 * The dashboard's contents: each distinct saved card it shows, in order. Text,
 * heading, link, iframe and action dashcards show no card, so they are not
 * contents, and neither is a card the user cannot read.
 */
export function getDashboardContentItems(
  cards: readonly (Card | UnreadableCard)[],
): Card[] {
  const cardsById = new Map<CardId, Card>();
  for (const card of cards) {
    if (isReadableCard(card) && !cardsById.has(card.id)) {
      cardsById.set(card.id, card);
    }
  }
  return [...cardsById.values()];
}

export function filterDashboardContentItems(
  items: Card[],
  searchQuery: string,
): Card[] {
  const query = searchQuery.trim().toLowerCase();
  if (query.length === 0) {
    return items;
  }
  return items.filter((item) => item.name.toLowerCase().includes(query));
}

export function getDashboardContentItemUrl(item: Card): string {
  return item.type === "metric"
    ? Urls.dataStudioMetric(item.id)
    : Urls.card(item);
}
