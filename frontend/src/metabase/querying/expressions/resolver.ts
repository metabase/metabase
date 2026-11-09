import { c, t } from "ttag";

import { memoize } from "metabase/utils/memoize";
import * as Lib from "metabase-lib";

import { CompileError } from "./errors";
import { EDITOR_FK_SYMBOLS, getDisplayNameWithSeparator } from "./identifier";
import type { Node } from "./pratt";

export type Resolver = (
  type: Lib.ExpressionType,
  name: string,
  node?: Node,
) => Lib.ExpressionParts | Lib.ExpressionArg;

type Options = {
  query: Lib.Query;
  stageIndex: number;
  expressionMode: Lib.ExpressionMode;
  availableColumns: Lib.ColumnMetadata[];
  availableMetrics?: Lib.MetricMetadata[];
};

export function resolver(options: Options): Resolver {
  const {
    query,
    stageIndex,
    expressionMode,
    availableColumns,
    availableMetrics,
  } = options;

  const metrics = memoize(
    () => availableMetrics ?? Lib.availableMetrics(query, stageIndex),
  );
  const segments = memoize(() => Lib.availableSegments(query, stageIndex));
  const measures = memoize(() => Lib.availableMeasures(query, stageIndex));

  const cache = infoCache(options);

  return function (type, name, node) {
    const findByName = nameMatcher(name, cache);

    if (type === "aggregation") {
      // Return metrics
      const dimension = findByName([
        ...metrics(),
        ...measures(),
        ...availableColumns,
      ]);

      if (!dimension) {
        throw new CompileError(
          t`There's no metric or measure called "${name}". Check the spelling, or use a function like Sum([Total]).`,
          node,
        );
      } else if (
        !Lib.isMetricMetadata(dimension) &&
        !Lib.isMeasureMetadata(dimension)
      ) {
        // If no metric was found, but there is a matching column,
        // show a more sophisticated error message
        throw new CompileError(
          c(
            "{0} is an identifier of the field provided by user in a custom expression",
          )
            .t`"${name}" is a column, so it can't be used as a summary on its own. Wrap it in a function like Sum([${name}]) or Average([${name}]).`,
          node,
        );
      }
      return dimension;
    }

    if (type === "boolean") {
      // Return segments and boolean columns
      const dimension = findByName([
        ...segments(),
        ...availableColumns.filter(Lib.isBoolean),
      ]);
      if (!dimension) {
        throw new CompileError(
          t`There's no true-or-false column or segment called "${name}". Replace it with a check that's true or false, like [Total] > 100.`,
          node,
        );
      }
      return dimension;
    }

    // Return columns and, in the case of aggregation expressions, metrics and measures
    const dimension = findByName([
      ...availableColumns,
      ...(expressionMode === "aggregation"
        ? [...metrics(), ...measures()]
        : []),
    ]);
    if (!dimension) {
      if (expressionMode === "aggregation") {
        throw new CompileError(
          t`There's no column, metric or measure called "${name}". Check the spelling, or press [ to see the list.`,
          node,
        );
      }
      throw new CompileError(
        t`There's no column called "${name}". Check the spelling, or press [ to see the list of columns.`,
        node,
      );
    }
    return dimension;
  };
}

type Dimension =
  | Lib.ColumnMetadata
  | Lib.MeasureMetadata
  | Lib.MetricMetadata
  | Lib.SegmentMetadata;

type DimensionInfo =
  | Lib.ColumnDisplayInfo
  | Lib.MeasureDisplayInfo
  | Lib.MetricDisplayInfo
  | Lib.SegmentDisplayInfo;

function nameMatcher(
  name: string,
  info: (dimension: Dimension) => DimensionInfo,
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
  const cache = new Map<Dimension, DimensionInfo>();
  return function (dimension: Dimension): DimensionInfo {
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
