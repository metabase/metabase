import crossfilter from "crossfilter";
import * as d3 from "d3";
import _ from "underscore";

import { isNotNull } from "metabase/lib/types";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import { isDate, isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";

export const MAX_SERIES = 100;
export const MAX_REASONABLE_SANKEY_DIMENSION_CARDINALITY = 100;

const SPLIT_AXIS_UNSPLIT_COST = -100;
const SPLIT_AXIS_COST_FACTOR = 2;
const SPLIT_AXIS_MAX_DEPTH = 8;

// NOTE Atte Keinänen 8/3/17: Moved from settings.js because this way we
// are able to avoid circular dependency errors in e2e tests
export function columnsAreValid(colNames, data, filter = () => true) {
  if (typeof colNames === "string") {
    colNames = [colNames];
  }
  if (!data || !Array.isArray(colNames)) {
    return false;
  }
  const colsByName = {};
  for (const col of data.cols) {
    colsByName[col.name] = col;
  }

  const isValid = colNames.reduce(
    (acc, name) =>
      acc && (name == null || (colsByName[name] && filter(colsByName[name]))),
    true,
  );

  return Boolean(isValid);
}

// computed size properties (drop 'px' and convert string -> Number)
function getComputedSizeProperty(prop, element) {
  const val = document.defaultView
    .getComputedStyle(element, null)
    .getPropertyValue(prop);
  return val ? parseFloat(val.replace("px", "")) : 0;
}

/// height available for rendering the card
export function getAvailableCanvasHeight(element) {
  const parent = element.parentElement;
  const parentHeight = getComputedSizeProperty("height", parent);
  const parentPaddingTop = getComputedSizeProperty("padding-top", parent);
  const parentPaddingBottom = getComputedSizeProperty("padding-bottom", parent);

  // NOTE: if this magic number is not 3 we can get into infinite re-render loops
  return parentHeight - parentPaddingTop - parentPaddingBottom - 3; // why the magic number :/
}

/// width available for rendering the card
export function getAvailableCanvasWidth(element) {
  const parent = element.parentElement;
  const parentWidth = getComputedSizeProperty("width", parent);
  const parentPaddingLeft = getComputedSizeProperty("padding-left", parent);
  const parentPaddingRight = getComputedSizeProperty("padding-right", parent);

  return parentWidth - parentPaddingLeft - parentPaddingRight;
}

function generateSplits(list, left = [], right = [], depth = 0) {
  // NOTE: currently generates all permutations, some of which are equivalent
  if (list.length === 0) {
    return [[left, right]];
  } else if (depth > SPLIT_AXIS_MAX_DEPTH) {
    // If we reach our max depth, we need to ensure that any item that haven't been added either list are accounted for
    return left.length < right.length
      ? [[left.concat(list), right]]
      : [[left, right.concat(list)]];
  } else {
    return [
      ...generateSplits(
        list.slice(1),
        left.concat([list[0]]),
        right,
        depth + 1,
      ),
      ...generateSplits(
        list.slice(1),
        left,
        right.concat([list[0]]),
        depth + 1,
      ),
    ];
  }
}

function axisCost(seriesExtents, favorUnsplit = true) {
  const axisExtent = d3.extent([].concat(...seriesExtents)); // concat to flatten the array
  const axisRange = axisExtent[1] - axisExtent[0];
  if (favorUnsplit && seriesExtents.length === 0) {
    return SPLIT_AXIS_UNSPLIT_COST;
  } else if (axisRange === 0) {
    return 0;
  } else {
    return seriesExtents.reduce(
      (sum, seriesExtent) =>
        sum +
        Math.pow(
          axisRange / (seriesExtent[1] - seriesExtent[0]),
          SPLIT_AXIS_COST_FACTOR,
        ),
      0,
    );
  }
}

export function computeSplit(extents, left = [], right = []) {
  const unassigned = extents
    .map((e, i) => i)
    .filter((i) => left.indexOf(i) < 0 && right.indexOf(i) < 0);

  // if any are assigned to right we have decided to split so don't favor unsplit
  const favorUnsplit = right.length > 0;

  const cost = (split) =>
    axisCost(
      split[0].map((i) => extents[i]),
      favorUnsplit,
    ) +
    axisCost(
      split[1].map((i) => extents[i]),
      favorUnsplit,
    );

  const splits = generateSplits(unassigned, left, right);

  let best, bestCost;
  for (const split of splits) {
    const splitCost = cost(split);
    if (!best || splitCost < bestCost) {
      best = split;
      bestCost = splitCost;
    }
  }

  // don't sort if we provided an initial left/right
  if (left.length > 0 || right.length > 0) {
    return best;
  } else {
    return best && best.sort((a, b) => a[0] - b[0]);
  }
}

export function isSameSeries(seriesA, seriesB) {
  return (
    (seriesA && seriesA.length) === (seriesB && seriesB.length) &&
    _.zip(seriesA, seriesB).reduce((acc, [a, b]) => {
      const sameData = a.data === b.data;
      const sameDisplay =
        (a.card && a.card.display) === (b.card && b.card.display);
      const sameVizSettings =
        (a.card && JSON.stringify(a.card.visualization_settings)) ===
        (b.card && JSON.stringify(b.card.visualization_settings));
      return acc && sameData && sameDisplay && sameVizSettings;
    }, true)
  );
}

export function colorShades(color, count) {
  return _.range(count).map((i) =>
    colorShade(color, 1 - Math.min(0.25, 1 / count) * i),
  );
}

export function colorShade(hex, shade = 0) {
  const match = hex.match(/#(?:(..)(..)(..)|(.)(.)(.))/);
  if (!match) {
    return hex;
  }
  const components = (
    match[1] != null ? match.slice(1, 4) : match.slice(4, 7)
  ).map((d) => parseInt(d, 16));
  const min = Math.min(...components);
  const max = Math.max(...components);
  return (
    "#" +
    components
      .map((c) =>
        Math.round(min + (max - min) * shade * (c / 255)).toString(16),
      )
      .join("")
  );
}

// cache computed cardinalities in a weak map since they are computationally expensive
const cardinalityCache = new Map();

export function getColumnCardinality(cols, rows, index) {
  const col = cols[index];
  const key = getColumnKey(col);
  if (!cardinalityCache.has(key)) {
    const dataset = crossfilter(rows);
    cardinalityCache.set(
      key,
      dataset
        .dimension((d) => d[index])
        .group()
        .size(),
    );
  }
  return cardinalityCache.get(key);
}

const extentCache = new WeakMap();

export function getColumnExtent(cols, rows, index) {
  const col = cols[index];
  if (!extentCache.has(col)) {
    extentCache.set(
      col,
      d3.extent(rows, (row) => row[index]),
    );
  }
  return extentCache.get(col);
}

// TODO Atte Keinänen 5/30/17 Extract to metabase-lib card/question logic
export const cardHasBecomeDirty = (nextCard, previousCard) =>
  !_.isEqual(previousCard.dataset_query, nextCard.dataset_query) ||
  previousCard.display !== nextCard.display;

export function getCardAfterVisualizationClick(nextCard, previousCard) {
  if (cardHasBecomeDirty(nextCard, previousCard)) {
    const isMultiseriesQuestion = !nextCard.id;
    const alreadyHadLineage = !!previousCard.original_card_id;

    return {
      ...nextCard,
      type: "question",
      // Original card id is needed for showing the "started from" lineage in dirty cards.
      original_card_id: alreadyHadLineage
        ? // Just recycle the original card id of previous card if there was one
          previousCard.original_card_id
        : // A multi-aggregation or multi-breakout series legend / drill-through action
          // should always use the id of underlying/previous card
          isMultiseriesQuestion
          ? previousCard.id
          : nextCard.id,
      id: null,
    };
  } else {
    // Even though the card is currently clean, we might still apply dashboard parameters to it,
    // so add the original_card_id to ensure a correct behavior in that context
    return {
      ...nextCard,
      original_card_id: nextCard.id,
    };
  }
}

export function getDefaultDimensionAndMetric(series) {
  const columns = getDefaultDimensionsAndMetrics(series, 1, 1);
  return {
    dimension: columns.dimensions[0],
    metric: columns.metrics[0],
  };
}

export function getSingleSeriesDimensionsAndMetrics(
  series,
  maxDimensions = 2,
  maxMetrics = Infinity,
) {
  const { data } = series;
  if (!data) {
    return {
      dimensions: [null],
      metrics: [null],
    };
  }

  const { cols, rows } = data;

  let dimensions = [];
  let metrics = [];

  // in MBQL queries that are broken out, metrics and dimensions are mutually exclusive
  // in SQL queries and raw MBQL queries metrics are numeric, summable, non-PK/FK and dimensions can be anything
  const metricColumns = cols.filter(
    (col) => isMetric(col) && !col.binning_info, // do not treat column with binning_info as metric by default (metabase#10493)
  );
  const dimensionNotMetricColumns = cols.filter(
    (col) => isDimension(col) && !metricColumns.find((item) => item === col),
  );
  if (
    dimensionNotMetricColumns.length <= maxDimensions &&
    metricColumns.length <= maxMetrics
  ) {
    dimensions = dimensionNotMetricColumns;
    metrics = metricColumns;
  }

  if (dimensions.length === 2) {
    if (isDate(dimensions[1]) && !isDate(dimensions[0])) {
      // if the series dimension is a date but the axis dimension is not then swap them
      dimensions.reverse();
    } else if (
      getColumnCardinality(cols, rows, cols.indexOf(dimensions[0])) <
      getColumnCardinality(cols, rows, cols.indexOf(dimensions[1]))
    ) {
      // if the series dimension is higher cardinality than the axis dimension then swap them
      dimensions.reverse();
    }
  }

  if (
    dimensions.length > 1 &&
    getColumnCardinality(cols, rows, cols.indexOf(dimensions[1])) > MAX_SERIES
  ) {
    dimensions.pop();
  }

  return {
    dimensions: dimensions.length > 0 ? dimensions.map((c) => c.name) : [null],
    metrics: metrics.length > 0 ? metrics.map((c) => c.name) : [null],
  };
}

export function getDefaultDimensionsAndMetrics(
  rawSeries,
  maxDimensions = 2,
  maxMetrics = Infinity,
) {
  return getSingleSeriesDimensionsAndMetrics(
    rawSeries[0],
    maxDimensions,
    maxMetrics,
  );
}

// Figure out how many decimal places are needed to represent the smallest
// values in the chart with a certain number of significant digits.
export function computeMaxDecimalsForValues(values, options) {
  try {
    // Intl.NumberFormat isn't supported on all browsers, so wrap in try/catch
    const formatter = Intl.NumberFormat("en", options);
    let maxDecimalCount = 0;
    for (const value of values) {
      const parts = formatter.formatToParts(value);
      const part = parts.find((p) => p.type === "fraction");
      const decimalCount = part ? part.value.length : 0;
      if (decimalCount > maxDecimalCount) {
        maxDecimalCount = decimalCount;
      }
    }
    return maxDecimalCount;
  } catch (e) {
    return undefined;
  }
}

export const preserveExistingColumnsOrder = (prevColumns, newColumns) => {
  if (!prevColumns || prevColumns.length === 0) {
    return newColumns;
  }

  const newSet = new Set(newColumns);
  const prevSet = new Set(prevColumns);

  const addedColumns = newColumns.filter((column) => !prevSet.has(column));
  const prevOrderedColumnsExceptRemoved = prevColumns.map((column) =>
    newSet.has(column) ? column : null,
  );

  const mergedColumnsResult = [];

  while (
    prevOrderedColumnsExceptRemoved.length > 0 ||
    addedColumns.length > 0
  ) {
    const column = prevOrderedColumnsExceptRemoved.shift();

    if (column != null) {
      mergedColumnsResult.push(column);
      continue;
    }

    const addedColumn = addedColumns.shift();

    if (addedColumn != null) {
      mergedColumnsResult.push(addedColumn);
    }
  }

  return mergedColumnsResult;
};

export function getCardKey(cardId) {
  return `${cardId ?? "unsaved"}`;
}

const PIVOT_SENSIBLE_MAX_CARDINALITY = 16;

export const getDefaultPivotColumn = (cols, rows) => {
  const columnsWithCardinality = cols
    .map((column, index) => {
      if (!isDimension(column)) {
        return null;
      }

      const cardinality = getColumnCardinality(cols, rows, index);
      if (cardinality > PIVOT_SENSIBLE_MAX_CARDINALITY) {
        return null;
      }

      return { column, cardinality };
    })
    .filter(isNotNull);

  return (
    _.min(columnsWithCardinality, ({ cardinality }) => cardinality)?.column ??
    null
  );
};

const MAX_SANKEY_COLUMN_PAIRS_TO_CHECK = 6;

function findSankeyColumnPair(dimensionColumns, rows) {
  if (dimensionColumns.length < 2) {
    return null;
  }

  const pairsToCheck = Math.min(
    dimensionColumns.length - 1,
    MAX_SANKEY_COLUMN_PAIRS_TO_CHECK,
  );
  for (let i = 0; i < pairsToCheck; i++) {
    const sourceCol = dimensionColumns[i];

    const sourceValues = new Set(rows.map((row) => row[sourceCol.index]));

    const targetCol = dimensionColumns.slice(i + 1).find((maybeTarget) => {
      return rows.some((row) => sourceValues.has(row[maybeTarget.index]));
    });

    if (targetCol) {
      return {
        source: sourceCol.column.name,
        target: targetCol.column.name,
      };
    }
  }

  return {
    source: dimensionColumns[0].column.name,
    target: dimensionColumns[1].column.name,
  };
}

export function findSensibleSankeyColumns(data) {
  if (!data?.cols || !data?.rows) {
    return null;
  }

  const { cols, rows } = data;

  // Single pass through columns to categorize them
  const { dimensionColumns, metricColumn } = cols.reduce(
    (acc, col, index) => {
      if (isMetric(col)) {
        // Take the first metric column we find
        if (!acc.metricColumn) {
          acc.metricColumn = col;
        }
      } else if (isDimension(col) && !isDate(col)) {
        // Limited quick cardinality check before doing full computation
        const uniqueValues = new Set();
        const rowsToQuickCheck = Math.min(
          rows.length,
          MAX_REASONABLE_SANKEY_DIMENSION_CARDINALITY * 1.5,
        );
        for (let i = 0; i < rowsToQuickCheck; i++) {
          uniqueValues.add(rows[i][index]);
        }

        // Only do full cardinality check if initial sample looks promising
        if (
          uniqueValues.size > 0 &&
          uniqueValues.size <= MAX_REASONABLE_SANKEY_DIMENSION_CARDINALITY
        ) {
          const cardinality = getColumnCardinality(cols, rows, index);
          if (
            cardinality > 0 &&
            cardinality <= MAX_REASONABLE_SANKEY_DIMENSION_CARDINALITY
          ) {
            acc.dimensionColumns.push({ column: col, index, cardinality });
          }
        }
      }
      return acc;
    },
    { dimensionColumns: [], metricColumn: null },
  );

  if (!metricColumn) {
    return null;
  }

  dimensionColumns.sort((a, b) => a.cardinality - b.cardinality);

  const dimensionPair = findSankeyColumnPair(dimensionColumns, rows);
  if (!dimensionPair) {
    return null;
  }

  return {
    source: dimensionPair.source,
    target: dimensionPair.target,
    metric: metricColumn.name,
  };
}
