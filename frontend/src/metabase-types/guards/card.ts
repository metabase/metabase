import type {
  Card,
  UnsavedCard,
  VizSettingColumnReference,
  VizSettingValueCondition,
} from "metabase-types/api";

export function isSavedCard(card: Card | UnsavedCard): card is Card {
  return "id" in card && card.id != null;
}

export function isVizSettingColumnReference(
  vizSettingValue: unknown,
): vizSettingValue is VizSettingColumnReference {
  return (
    typeof vizSettingValue === "object" &&
    vizSettingValue !== null &&
    "type" in vizSettingValue &&
    "card_id" in vizSettingValue &&
    "column_name" in vizSettingValue &&
    vizSettingValue.type === "card" &&
    typeof vizSettingValue.card_id === "number" &&
    typeof vizSettingValue.column_name === "string"
  );
}

// TODO Rewrite
export function isVizSettingValueConditions(
  vizSettingValue: unknown,
): vizSettingValue is VizSettingValueCondition[] {
  return (
    Array.isArray(vizSettingValue) &&
    vizSettingValue.every(v => "column" in v && "operator" in v)
  );
}
