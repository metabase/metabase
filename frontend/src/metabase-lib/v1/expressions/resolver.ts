import { c, t } from "ttag";
import _ from "underscore";

import * as Lib from "metabase-lib";

import { CompileError } from "./errors";
import { EDITOR_FK_SYMBOLS, getDisplayNameWithSeparator } from "./identifier";
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
    const findByName = nameMatcher(name, cache);

    if (type === "aggregation") {
      // Return metrics
      const dimension = findByName([...metrics(), ...columns()]);
      if (!dimension) {
        throw new CompileError(t`Unknown Metric: ${name}`, node);
      } else if (!Lib.isMetricMetadata(dimension)) {
        // If no metric was found, but there is a matching column,
        // show a more sophisticated error message
        throw new CompileError(
          c(
            "{0} is an identifier of the field provided by user in a custom expression",
          )
            .t`No aggregation found in: ${name}. Use functions like Sum() or custom Metrics`,
          node,
        );
      }
      return dimension;
    }

    if (type === "boolean") {
      // Return segments and boolean columns
      const dimension = findByName([
        ...segments(),
        ...columns().filter(Lib.isBoolean),
      ]);
      if (!dimension) {
        throw new CompileError(
          t`Unknown Segment or boolean column: ${name}`,
          node,
        );
      }
      return dimension;
    }

    // Return columns and, in the case of aggregation expressions, metrics
    const dimension = findByName([
      ...columns(),
      ...(expressionMode === "aggregation" ? metrics() : []),
    ]);
    if (!dimension) {
      if (expressionMode === "aggregation") {
        throw new CompileError(t`Unknown column or Metric: ${name}`, node);
      }
      throw new CompileError(t`Unknown column: ${name}`, node);
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
): (dimensions: Dimension[]) => Dimension | undefined {
  function byName({
    preserveSeparators,
    caseSensitive,
  }: {
    preserveSeparators: boolean;
    caseSensitive: boolean;
  }) {
    return (dimension: Dimension) => {
      if (preserveSeparators || !Lib.isColumnMetadata(dimension)) {
        return equals(caseSensitive, name, info(dimension).longDisplayName);
      }

      // When exact = false, we allow matching columns on other separators,
      // ie. [User.ID] will match [User → ID]
      return EDITOR_FK_SYMBOLS.symbols.some((separator) =>
        equals(
          caseSensitive,
          name,
          getDisplayNameWithSeparator(
            info(dimension).longDisplayName,
            separator,
          ),
        ),
      );
    };
  }

  // Match the name in this order, expanding the search in every step:
  // - exact matches, ie. [Foo] will Foo and nothing else, [Foo.Bar] will only match Foo.Bar, etc.
  // - exact matches ignoring case, ie [FOO] will match foo and Foo, and [FOO.Bar] will match Foo.Bar and foo.BAR, etc.
  // - matches different separators, ie [Foo.Bar] will match [Foo → Bar] and vice versa, but not [FOO → Bar]
  // - matches different separators, case insensitively, ie [Foo.Bar] will match [Foo → Bar] and [FOO → Bar], etc.
  //
  // prettier-ignore this expression because this becomes
  // unreadable when formatted.
  // prettier-ignore
  return (dimensions) =>
    dimensions.find(byName({ preserveSeparators: true, caseSensitive: true })) ??
    dimensions.find(byName({ preserveSeparators: true, caseSensitive: false })) ??
    dimensions.find(byName({ preserveSeparators: false, caseSensitive: true })) ??
    dimensions.find(byName({ preserveSeparators: false, caseSensitive: false }));
}

function equals(caseSensitive: boolean, a: string, b: string) {
  if (caseSensitive) {
    return a === b;
  }
  return a.toLowerCase() === b.toLowerCase();
}

// A cache for the displayInfo of metadata in the query.
// The cache only lives for the duration of each compile phase,
// so the query can not change in the meantime.
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
    // @ts-expect-error: for some reason TS will not allow this to be typed correctly,
    // even though all the types in the Dimension union match the types for displayInfo
    const res = Lib.displayInfo(options.query, options.stageIndex, dimension);
    cache.set(dimension, res);
    return res;
  };
}
