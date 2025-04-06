import { c, t } from "ttag";

import * as Lib from "metabase-lib";
import type { Expression } from "metabase-types/api";

import { ResolverError } from "./errors";
import { parseDimension, parseMetric, parseSegment } from "./identifier";
import { resolve } from "./resolver";
import type { StartRule } from "./types";
import { getNode } from "./utils";

export function resolverPass({
  query,
  stageIndex,
  startRule,
}: {
  query: Lib.Query;
  stageIndex: number;
  startRule: StartRule;
}) {
  return (expression: Expression): Expression =>
    resolve({
      expression,
      type: startRule,
      fn: fieldResolver({
        query,
        stageIndex,
        startRule,
      }),
    });
}

export function fieldResolver(options: {
  query: Lib.Query;
  stageIndex: number;
  startRule: string;
}) {
  return function (
    kind: "field" | "segment" | "metric" | "dimension",
    name: string,
    expression?: Expression,
  ): Expression {
    const { query, stageIndex } = options;
    if (!query) {
      // @uladzimirdev double check why is this needed
      return [kind, name];
    }

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

      return Lib.legacyRef(query, stageIndex, metric) as Expression;
    } else if (kind === "segment") {
      const segment = parseSegment(name, options);
      if (!segment) {
        throw new ResolverError(
          t`Unknown Segment: ${name}`,
          getNode(expression),
        );
      }

      return Lib.legacyRef(query, stageIndex, segment) as Expression;
    } else {
      // fallback
      const dimension = parseDimension(name, options);
      if (!dimension) {
        throw new ResolverError(t`Unknown Field: ${name}`, getNode(expression));
      }

      return Lib.legacyRef(query, stageIndex, dimension) as Expression;
    }
  };
}
