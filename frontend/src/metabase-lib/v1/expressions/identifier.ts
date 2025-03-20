import { FK_SYMBOL } from "metabase/lib/formatting";
import * as Lib from "metabase-lib";

import { EDITOR_FK_SYMBOLS, EDITOR_QUOTES, getMBQLName } from "./config";
import { quoteString } from "./string";

// can be double-quoted, but are not by default unless they have non-word characters or are reserved
export function formatIdentifier(
  name: string,
  { quotes = EDITOR_QUOTES } = {},
) {
  if (
    !quotes.identifierAlwaysQuoted &&
    /^\w+$/.test(name) &&
    !isReservedWord(name)
  ) {
    return name;
  }
  return quoteString(name, quotes.identifierQuoteDefault);
}

function isReservedWord(word: string) {
  return !!getMBQLName(word);
}

export function parseMetric(
  metricName: string,
  { query, stageIndex }: { query: Lib.Query; stageIndex: number },
) {
  const metrics = Lib.availableMetrics(query, stageIndex);

  const metric = metrics.find(metric => {
    const displayInfo = Lib.displayInfo(query, stageIndex, metric);

    return displayInfo.displayName.toLowerCase() === metricName.toLowerCase();
  });

  if (metric) {
    return metric;
  }
}

export function formatMetricName(
  metricName: string,
  options: Record<string, any>,
) {
  return formatIdentifier(metricName, options);
}

export function parseSegment(
  segmentName: string,
  { query, stageIndex }: { query: Lib.Query; stageIndex: number },
) {
  const segment = Lib.availableSegments(query, stageIndex).find(segment => {
    const displayInfo = Lib.displayInfo(query, stageIndex, segment);

    return displayInfo.displayName.toLowerCase() === segmentName.toLowerCase();
  });

  if (segment) {
    return segment;
  }

  const column = Lib.fieldableColumns(query, stageIndex).find(field => {
    const displayInfo = Lib.displayInfo(query, stageIndex, field);
    return displayInfo.name.toLowerCase() === segmentName.toLowerCase();
  });

  if (column && Lib.isBoolean(column)) {
    return column;
  }
}

export function formatSegmentName(
  segmentName: string,
  options: Record<string, any>,
) {
  return formatIdentifier(segmentName, options);
}

// DIMENSIONS

/**
 * Find dimension with matching `name` in query. TODO - How is this "parsing" a dimension? Not sure about this name.
 */
export function parseDimension(
  name: string,
  options: {
    query: Lib.Query;
    stageIndex: number;
    expressionIndex?: number | undefined;
    startRule: string;
  },
) {
  return getAvailableDimensions(options).find(({ info }) => {
    return EDITOR_FK_SYMBOLS.symbols.some(separator => {
      const displayName = getDisplayNameWithSeparator(
        info.longDisplayName,
        separator,
      );

      return displayName === name;
    });
  })?.dimension;
}

function getAvailableDimensions({
  query,
  stageIndex,
  expressionIndex,
  startRule,
}: {
  query: Lib.Query;
  stageIndex: number;
  expressionIndex?: number | undefined;
  startRule: string;
}) {
  const results = Lib.expressionableColumns(
    query,
    stageIndex,
    expressionIndex,
  ).map(dimension => {
    return {
      dimension,
      info: Lib.displayInfo(query, stageIndex, dimension),
    };
  });

  if (startRule === "aggregation") {
    return [
      ...results,
      ...Lib.availableMetrics(query, stageIndex).map(dimension => {
        return {
          dimension,
          info: Lib.displayInfo(query, stageIndex, dimension),
        };
      }),
    ];
  }

  return results;
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
