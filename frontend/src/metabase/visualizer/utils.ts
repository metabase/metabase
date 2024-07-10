import {
  isNumeric,
  isDate,
  isDateWithoutTime,
  isTime,
} from "metabase-lib/v1/types/utils/isa";
import type { Card, Field } from "metabase-types/api";

const areaBarLine = ["area", "bar", "line"];

export function canCombineCardWithOthers(card: Card) {
  return card.display === "scalar" || areaBarLine.includes(card.display);
}

export function areCardsCompatible(card1: Card, card2: Card) {
  if (
    areaBarLine.includes(card1.display) &&
    areaBarLine.includes(card2.display)
  ) {
    return areAreaBarLineSeriesCompatible(card1, card2);
  }

  if (card1.display === "scalar" && card2.display === "scalar") {
    return (
      card1.result_metadata.length === 1 && card2.result_metadata.length === 1
    );
  }

  return false;
}

// Mimics the `area-bar-line-series-are-compatible?` fn from `GET /api/card/:id/series`
// https://github.com/metabase/metabase/blob/5cfc079d1db6e69bf42705f0eeba431a6e39c6b5/src/metabase/api/card.clj#L219
function areAreaBarLineSeriesCompatible(card1: Card, card2: Card) {
  const initialDimensions = (
    card1.visualization_settings["graph.dimensions"] ?? []
  ).map(col => card1.result_metadata.find(c => c.name === col));
  const newDimensions = (
    card2.visualization_settings["graph.dimensions"] ?? []
  ).map(col => card2.result_metadata.find(c => c.name === col));
  const newMetrics = (card2.visualization_settings["graph.metrics"] ?? []).map(
    col => card2.result_metadata.find(c => c.name === col),
  );

  if (
    newDimensions.length === 0 ||
    newMetrics.length === 0 ||
    !newMetrics.every(isNumeric)
  ) {
    return false;
  }

  const primaryInitialDimension = initialDimensions[0] as Field;
  const primaryNewDimension = newDimensions[0] as Field;

  // both or neither primary dimension must be dates
  // both or neither primary dimension must be numeric
  // TODO handle 👇
  // a timestamp field is both date and number so don't enforce the condition if both fields are dates; see #2811
  return (
    isTemporal(primaryInitialDimension) === isTemporal(primaryNewDimension) ||
    isNumeric(primaryInitialDimension) !== isNumeric(primaryNewDimension)
  );
}

function isTemporal(col: Field) {
  return isDate(col) || isDateWithoutTime(col) || isTime(col);
}
