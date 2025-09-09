import type { Card, VirtualCard } from "metabase-types/api";

export function expandInlineCard(card?: Card | VirtualCard) {
  return {
    name: "",
    visualization_settings: {},
    ...card,
    id: _.uniqueId("card"),
  };
}

export function isQuestionCard(card: Card | VirtualCard) {
  // Some old virtual cards have dataset_query equal to {} so we need to check for null and empty object
  return (
    card.dataset_query != null && Object.keys(card.dataset_query).length > 0
  );
}
