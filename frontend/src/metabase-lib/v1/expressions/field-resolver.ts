import { c, t } from "ttag";

import type * as Lib from "metabase-lib";

import { ResolverError } from "./errors";
import { parseDimension, parseMetric, parseSegment } from "./identifier";
import { getNode } from "./utils";

export type Kind = "field" | "metric" | "segment";

export type Resolver = (
  kind: Kind,
  name: string,
  expression?: Lib.ExpressionParts,
) => Lib.ColumnMetadata | Lib.SegmentMetadata | Lib.MetricMetadata;

export function fieldResolver(options: {
  query: Lib.Query;
  stageIndex: number;
  startRule: string;
}): Resolver {
  return function (kind, name, expression) {
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

          throw new ResolverError(error, getNode(expression));
        }

        throw new ResolverError(
          t`Unknown Metric: ${name}`,
          getNode(expression),
        );
      }

      return metric;
    } else if (kind === "segment") {
      const segment = parseSegment(name, options);
      if (!segment) {
        throw new ResolverError(
          t`Unknown Segment: ${name}`,
          getNode(expression),
        );
      }

      return segment;
    } else {
      // fallback
      const dimension = parseDimension(name, options);
      if (!dimension) {
        throw new ResolverError(t`Unknown Field: ${name}`, getNode(expression));
      }

      return dimension;
    }
  };
}
