import _ from "underscore";

import * as Urls from "metabase/urls";
import type { Card, Collection, UnreadableCard } from "metabase-types/api";
import { isReadableCard } from "metabase-types/guards/dashboard";

import { isLibraryCollectionType } from "../../../utils";

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

/**
 * Where a content row opens: Data Studio for a metric saved in the Library,
 * the main app for everything else, including a metric saved outside it.
 */
export function getDashboardContentItemUrl(
  item: Card,
  collectionType: Collection["type"],
): string {
  const isLibraryMetric =
    item.type === "metric" && isLibraryCollectionType(collectionType);
  return isLibraryMetric ? Urls.dataStudioMetric(item.id) : Urls.card(item);
}
