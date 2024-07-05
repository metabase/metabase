import {
  isNumeric,
  isDate,
  isDateWithoutTime,
  isTime,
} from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, SingleSeries } from "metabase-types/api";

const areBarLine = ["area", "bar", "line"];

export function areSeriesCompatible(s1: SingleSeries, s2: SingleSeries) {
  if (
    areBarLine.includes(s1.card.display) &&
    areBarLine.includes(s2.card.display)
  ) {
    return areAreaBarLineSeriesCompatible(s1, s2);
  }

  if (s1.card.display === "scalar" && s2.card.display === "scalar") {
    return (
      s1.card.result_metadata.length === 1 &&
      s2.card.result_metadata.length === 1
    );
  }

  return false;
}

// Mimics the `area-bar-line-series-are-compatible?` fn from `GET /api/card/:id/series`
// https://github.com/metabase/metabase/blob/5cfc079d1db6e69bf42705f0eeba431a6e39c6b5/src/metabase/api/card.clj#L219
function areAreaBarLineSeriesCompatible(s1: SingleSeries, s2: SingleSeries) {
  const card1 = s1.card;
  const card2 = s2.card;

  const initialDimensions = (
    card1.visualization_settings["graph.dimensions"] ?? []
  ).map(col => s1.data.cols.find(c => c.name === col));
  const newDimensions = (
    card2.visualization_settings["graph.dimensions"] ?? []
  ).map(col => s2.data.cols.find(c => c.name === col));
  const newMetrics = (card2.visualization_settings["graph.metrics"] ?? []).map(
    col => s2.data.cols.find(c => c.name === col),
  );

  if (
    newDimensions.length === 0 ||
    newMetrics.length === 0 ||
    !newMetrics.every(isNumeric)
  ) {
    return false;
  }

  const primaryInitialDimension = initialDimensions[0] as DatasetColumn;
  const primaryNewDimension = newDimensions[0] as DatasetColumn;

  // both or neither primary dimension must be dates
  // both or neither primary dimension must be numeric
  // TODO handle 👇
  // a timestamp field is both date and number so don't enforce the condition if both fields are dates; see #2811
  return (
    isTemporal(primaryInitialDimension) === isTemporal(primaryNewDimension) ||
    isNumeric(primaryInitialDimension) !== isNumeric(primaryNewDimension)
  );
}

function isTemporal(col: DatasetColumn) {
  return isDate(col) || isDateWithoutTime(col) || isTime(col);
}
