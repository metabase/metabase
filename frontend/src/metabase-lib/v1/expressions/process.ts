import { c, t } from "ttag";

import * as Lib from "metabase-lib";
import type { Expression } from "metabase-types/api";

import { parseDimension, parseMetric, parseSegment } from "./identifier";
import { adjustBooleans, parse } from "./recursive-parser";
import { resolve } from "./resolver";

export function processSource(options: {
  source: string;
  query: Lib.Query;
  stageIndex: number;
  startRule: string;
  expressionIndex?: number | undefined;
  name?: string;
}): {
  source: string;
  expression: Expression | null;
  expressionClause: Lib.ExpressionClause | null;
  compileError: Error | null;
} {
  const resolveMBQLField = (kind: string, name: string) => {
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

          throw new Error(error);
        }

        throw new Error(t`Unknown Metric: ${name}`);
      }

      return Lib.legacyRef(query, stageIndex, metric);
    } else if (kind === "segment") {
      const segment = parseSegment(name, options);
      if (!segment) {
        throw new Error(t`Unknown Segment: ${name}`);
      }

      return Lib.legacyRef(query, stageIndex, segment);
    } else {
      // fallback
      const dimension = parseDimension(name, options);
      if (!dimension) {
        throw new Error(t`Unknown Field: ${name}`);
      }

      return Lib.legacyRef(query, stageIndex, dimension);
    }
  };

  const { source, query, stageIndex, startRule } = options;

  let expression = null;
  let expressionClause = null;
  let compileError = null;
  try {
    const parsed = parse(source);
    expression = adjustBooleans(
      resolve({ expression: parsed, type: startRule, fn: resolveMBQLField }),
    );

    // query and stageIndex are not available outside of notebook editor (e.g. in Metrics or Segments).
    if (query && typeof stageIndex !== "undefined") {
      expressionClause = Lib.expressionClauseForLegacyExpression(
        query,
        stageIndex,
        expression,
      );
    }
  } catch (e) {
    console.warn("compile error", e);
    if (e instanceof Error) {
      compileError = e;
    } else {
      compileError = new Error(t`Unknown error`);
    }
  }

  return {
    source,
    expression,
    expressionClause,
    compileError,
  };
}
