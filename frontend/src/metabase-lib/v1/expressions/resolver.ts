import { c, t } from "ttag";

import * as Lib from "metabase-lib";

import { EDITOR_FK_SYMBOLS } from "./config";
import { ResolverError } from "./errors";
import { getDisplayNameWithSeparator } from "./identifier";
import type { Node } from "./pratt";

export type Kind = "field" | "metric" | "segment";

export type Resolver = (
  kind: Kind,
  name: string,
  node?: Node,
) => Lib.ColumnMetadata | Lib.SegmentMetadata | Lib.MetricMetadata;

export function resolver(options: {
  query: Lib.Query;
  stageIndex: number;
  expressionMode: Lib.ExpressionMode;
}): Resolver {
  return function (kind, name, node) {
    if (kind === "metric") {
      const metric = parseMetric(name, options);
      if (!metric) {
        const dimension = parseDimension(name, options);
        const isNameKnown = Boolean(dimension);

        if (isNameKnown) {
          const error = c(
            "{0} is an identifier of the field provided by user in a custom expression",
          )
            .t`No aggregation found in: ${name}. Use functions like Sum() or custom Metrics`;

          throw new ResolverError(error, node);
        }

        throw new ResolverError(t`Unknown Metric: ${name}`, node);
      }

      return metric;
    } else if (kind === "segment") {
      const segment = parseSegment(name, options);
      if (!segment) {
        throw new ResolverError(t`Unknown Segment: ${name}`, node);
      }

      return segment;
    } else {
      // fallback
      const dimension = parseDimension(name, options);
      if (!dimension) {
        throw new ResolverError(t`Unknown Field: ${name}`, node);
      }

      return dimension;
    }
  };
}

function parseMetric(
  metricName: string,
  { query, stageIndex }: { query: Lib.Query; stageIndex: number },
) {
  const metrics = Lib.availableMetrics(query, stageIndex);

  const metric = metrics.find((metric) => {
    const displayInfo = Lib.displayInfo(query, stageIndex, metric);

    return displayInfo.displayName.toLowerCase() === metricName.toLowerCase();
  });

  if (metric) {
    return metric;
  }
}

function parseSegment(
  segmentName: string,
  {
    query,
    stageIndex,
    expressionIndex,
  }: { query: Lib.Query; stageIndex: number; expressionIndex?: number },
) {
  const segment = Lib.availableSegments(query, stageIndex).find((segment) => {
    const displayInfo = Lib.displayInfo(query, stageIndex, segment);

    return displayInfo.displayName.toLowerCase() === segmentName.toLowerCase();
  });

  if (segment) {
    return segment;
  }

  const column = Lib.expressionableColumns(
    query,
    stageIndex,
    expressionIndex,
  ).find((field) => {
    const displayInfo = Lib.displayInfo(query, stageIndex, field);
    return displayInfo.displayName.toLowerCase() === segmentName.toLowerCase();
  });

  if (column && Lib.isBoolean(column)) {
    return column;
  }
}

export function parseDimension(
  name: string,
  options: {
    query: Lib.Query;
    stageIndex: number;
    expressionIndex?: number | undefined;
    expressionMode: Lib.ExpressionMode;
  },
) {
  return getAvailableDimensions(options).find(({ info }) => {
    return EDITOR_FK_SYMBOLS.symbols.some((separator) => {
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
  expressionMode,
}: {
  query: Lib.Query;
  stageIndex: number;
  expressionIndex?: number | undefined;
  expressionMode: Lib.ExpressionMode;
}) {
  const results = Lib.expressionableColumns(
    query,
    stageIndex,
    expressionIndex,
  ).map((dimension) => {
    return {
      dimension,
      info: Lib.displayInfo(query, stageIndex, dimension),
    };
  });

  if (expressionMode === "aggregation") {
    return [
      ...results,
      ...Lib.availableMetrics(query, stageIndex).map((dimension) => {
        return {
          dimension,
          info: Lib.displayInfo(query, stageIndex, dimension),
        };
      }),
    ];
  }

  return results;
}
