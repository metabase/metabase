import { t } from "ttag";

import * as Lib from "metabase-lib";

import { parse, adjustBooleans } from "./recursive-parser";
import { resolve } from "./resolver";

import { parseDimension, parseMetric, parseSegment } from "./index";

export function processSource(options: {
  source: string;
  query: Lib.Query;
  stageIndex: number;
  startRule: string;
  name?: string;
}) {
  const resolveMBQLField = (kind: string, name: string) => {
    if (kind === "metric") {
      const metric = parseMetric(name, options);
      if (!metric) {
        throw new Error(t`Unknown Metric: ${name}`);
      }

      return Lib.legacyRef(metric);
    } else if (kind === "segment") {
      const segment = parseSegment(name, options);
      if (!segment) {
        throw new Error(t`Unknown Segment: ${name}`);
      }

      return Lib.legacyRef(segment);
    } else {
      const reference = options.name ?? ""; // avoid circular reference

      // fallback
      const dimension = parseDimension(name, { reference, ...options });
      if (!dimension) {
        throw new Error(t`Unknown Field: ${name}`);
      }

      return Lib.legacyRef(dimension);
    }
  };

  const { source, query, stageIndex, startRule } = options;

  let expression = null;
  let expressionClause = null;
  let compileError;
  try {
    const parsed = parse(source);
    expression = adjustBooleans(resolve(parsed, startRule, resolveMBQLField));

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
