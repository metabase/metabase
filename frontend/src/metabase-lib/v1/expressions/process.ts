import { t } from "ttag";

import * as Lib from "metabase-lib";

import { parse, adjustBooleans } from "./recursive-parser";
import { resolve } from "./resolver";

import { parseDimension, parseMetric, parseSegment } from "./index";

export function processSource(options: {
  source: string;
  query: Lib.Query;
  stageIndex: number;
  expressionIndex: number | undefined;
  startRule: string;
  name?: string;
}) {
  const resolveMBQLField = (kind: string, name: string) => {
    if (kind === "metric") {
      const metric = parseMetric(name, options);
      if (!metric) {
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
  let compileError;
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
    compileError = e;
  }

  return {
    source,
    expression,
    expressionClause,
    compileError,
  };
}
