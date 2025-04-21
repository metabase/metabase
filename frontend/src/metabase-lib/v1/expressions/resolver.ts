import { c, t } from "ttag";
import _ from "underscore";

import * as Lib from "metabase-lib";

import { EDITOR_FK_SYMBOLS } from "./config";
import { ResolverError } from "./errors";
import { getDisplayNameWithSeparator } from "./identifier";
import type { Node } from "./pratt";
import type { ExpressionType } from "./types";

export type Resolver = (
  type: ExpressionType,
  name: string,
  node?: Node,
) => Lib.ExpressionParts | Lib.ExpressionArg;

type Options = {
  query: Lib.Query;
  stageIndex: number;
  expressionMode: Lib.ExpressionMode;
};

export function resolver(options: Options): Resolver {
  const { query, stageIndex, expressionMode } = options;

  const metrics = _.memoize(() => Lib.availableMetrics(query, stageIndex));
  const segments = _.memoize(() => Lib.availableSegments(query, stageIndex));
  const columns = _.memoize(() => Lib.expressionableColumns(query, stageIndex));
  const cache = infoCache(options);

  return function (type, name, node) {
    const hasMatchingName = nameMatcher(name, cache);

    if (type === "aggregation") {
      // Return metrics
      const availableDimensions = [...metrics(), ...columns()];
      const dimension = availableDimensions.find(hasMatchingName);

      if (!dimension) {
        throw new ResolverError(t`Unknown Metric: ${name}`, node);
      } else if (!Lib.isMetricMetadata(dimension)) {
        // If no metric was found, but there is a matching column,
        // show a more sophisticated error message
        const error = c(
          "{0} is an identifier of the field provided by user in a custom expression",
        )
          .t`No aggregation found in: ${name}. Use functions like Sum() or custom Metrics`;
        throw new ResolverError(error, node);
      }

      return dimension;
    }

    if (type === "boolean") {
      // Return segments and boolean fields
      const availableDimensions: Dimension[] = [
        ...segments(),
        ...columns().filter(Lib.isBoolean),
      ];
      const dimension = availableDimensions.find(hasMatchingName);
      if (!dimension) {
        throw new ResolverError(t`Unknown Segment: ${name}`, node);
      }
      return dimension;
    }

    // Return columns and, in the case of aggregation expressions, metrics
    const availableDimensions = [
      ...columns(),
      ...(expressionMode === "aggregation" ? metrics() : []),
    ];
    const dimension = availableDimensions.find(hasMatchingName);
    if (!dimension) {
      throw new ResolverError(t`Unknown Field: ${name}`, node);
    }

    return dimension;
  };
}

type Dimension = Lib.SegmentMetadata | Lib.MetricMetadata | Lib.ColumnMetadata;

function nameMatcher(
  name: string,
  info: (
    dimension: Dimension,
  ) => Lib.ColumnDisplayInfo | Lib.MetricDisplayInfo | Lib.SegmentDisplayInfo,
): (dimension: Dimension) => boolean {
  return function (dimension: Dimension) {
    if (Lib.isSegmentMetadata(dimension) || Lib.isSegmentMetadata(dimension)) {
      return info(dimension).displayName.toLowerCase() === name.toLowerCase();
    } else if (Lib.isColumnMetadata(dimension)) {
      return EDITOR_FK_SYMBOLS.symbols.some(
        (separator) =>
          name ===
          getDisplayNameWithSeparator(
            info(dimension).longDisplayName,
            separator,
          ),
      );
    }
    return false;
  };
}

function infoCache(options: Options) {
  const cache = new Map<
    Dimension,
    Lib.ColumnDisplayInfo | Lib.MetricDisplayInfo | Lib.SegmentDisplayInfo
  >();
  return function (dimension: Dimension) {
    const cached = cache.get(dimension);
    if (cached) {
      return cached;
    }
    // @ts-expect-error: for some reason, TS will not allow this to be typed correctly
    // even though all the types in the union match the types for displayInfo
    const res = Lib.displayInfo(options.query, options.stageIndex, dimension);
    cache.set(dimension, res);
    return res;
  };
}
