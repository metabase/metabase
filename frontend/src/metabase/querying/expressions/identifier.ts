import { FK_SYMBOL } from "metabase/lib/formatting/constants";

import { quoteString } from "./string";

const IDENTIFIER_QUOTE = "[";

export const EDITOR_FK_SYMBOLS = {
  // specifies which symbols can be used to delimit foreign/joined fields
  symbols: [".", " → "],
  // specifies the default/canonical symbol
  default: " → ",
};

// Quote identifiers with [ ]
export function formatIdentifier(name: string) {
  return quoteString(name, IDENTIFIER_QUOTE);
}

export function formatMetricName(metricName: string) {
  return formatIdentifier(metricName);
}

export function formatMeasureName(measureName: string) {
  return formatIdentifier(measureName);
}

export function formatSegmentName(segmentName: string) {
  return formatIdentifier(segmentName);
}

export function formatDimensionName(dimensionName: string) {
  return formatIdentifier(getDisplayNameWithSeparator(dimensionName));
}

export function getDisplayNameWithSeparator(
  displayName: string,
  separator = EDITOR_FK_SYMBOLS.default,
) {
  return displayName.replace(` ${FK_SYMBOL} `, separator);
}
