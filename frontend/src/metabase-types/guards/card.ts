import {
  type Card,
  LEGEND_POSITIONS,
  type LegendPosition,
  type LineStyle,
  type UnsavedCard,
} from "metabase-types/api";

export function isSavedCard(card: Card | UnsavedCard): card is Card {
  return "id" in card && card.id != null;
}

const LINE_STYLES: LineStyle[] = ["solid", "dashed", "dotted"];

export function isLineStyle(value: string): value is LineStyle {
  return LINE_STYLES.some((style) => style === value);
}

export function isLegendPosition(value: unknown): value is LegendPosition {
  return LEGEND_POSITIONS.some((position) => position === value);
}
