import { FK_SYMBOL } from "metabase/lib/formatting";

import { EDITOR_QUOTES, getMBQLName } from "./config";
import { quoteString } from "./string";

export const EDITOR_FK_SYMBOLS = {
  // specifies which symbols can be used to delimit foreign/joined fields
  symbols: [".", " → "],
  // specifies the default/canonical symbol
  default: " → ",
};

// can be double-quoted, but are not by default unless they have non-word characters or are reserved
export function formatIdentifier(
  name: string,
  { delimiters = EDITOR_QUOTES } = {},
) {
  if (
    !delimiters.identifierAlwaysQuoted &&
    /^\w+$/.test(name) &&
    !isReservedWord(name)
  ) {
    return name;
  }
  return quoteString(name, delimiters.identifierQuoteDefault);
}

function isReservedWord(word: string) {
  return Boolean(getMBQLName(word));
}

export function formatMetricName(
  metricName: string,
  options: Record<string, any>,
) {
  return formatIdentifier(metricName, options);
}

export function formatSegmentName(
  segmentName: string,
  options: Record<string, any>,
) {
  return formatIdentifier(segmentName, options);
}

export function formatDimensionName(
  dimensionName: string,
  options: Record<string, any>,
) {
  return formatIdentifier(getDisplayNameWithSeparator(dimensionName), options);
}

export function getDisplayNameWithSeparator(
  displayName: string,
  separator = EDITOR_FK_SYMBOLS.default,
) {
  return displayName.replace(` ${FK_SYMBOL} `, separator);
}
