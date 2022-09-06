import { t } from "ttag";

import {
  parse,
  adjustBooleans,
} from "metabase/lib/expressions/recursive-parser";
import { resolve } from "metabase/lib/expressions/resolver";

import {
  parseDimension,
  parseMetric,
  parseSegment,
} from "metabase/lib/expressions/";

export function processSource(options) {
  const resolveMBQLField = (kind, name) => {
    if (kind === "metric") {
      const metric = parseMetric(name, options);
      if (!metric) {
        throw new Error(t`Unknown Metric: ${name}`);
      }
      return ["metric", metric.id];
    } else if (kind === "segment") {
      const segment = parseSegment(name, options);
      if (!segment) {
        throw new Error(t`Unknown Segment: ${name}`);
      }
      return Array.isArray(segment.id) ? segment.id : ["segment", segment.id];
    } else {
      const reference = options.name; // avoid circular reference

      // fallback
      const dimension = parseDimension(name, { reference, ...options });
      if (!dimension) {
        throw new Error(t`Unknown Field: ${name}`);
      }
      return dimension.mbql();
    }
  };

  const { source, startRule } = options;

  let expression;
  let compileError;
  try {
    const parsed = parse(source);
    expression = adjustBooleans(resolve(parsed, startRule, resolveMBQLField));
  } catch (e) {
    console.warn("compile error", e);
    compileError = e;
  }

  return {
    source,
    expression,
    compileError,
  };
}
