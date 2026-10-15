import type {
  Card,
  LineStyle,
  UnreadableCard,
  UnsavedCard,
} from "metabase-types/api";

export function isSavedCard(card: Card | UnsavedCard): card is Card {
  return "id" in card && card.id != null;
}

export function isReadableCard(card: Card | UnreadableCard): card is Card {
  return "dataset_query" in card;
}

const LINE_STYLES: LineStyle[] = ["solid", "dashed", "dotted"];

export function isLineStyle(value: string): value is LineStyle {
  return LINE_STYLES.some((style) => style === value);
}
