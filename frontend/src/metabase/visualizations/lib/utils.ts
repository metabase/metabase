import crossfilter from "crossfilter";
import * as d3 from "d3";
import _ from "underscore";

import { isNotNull } from "metabase/lib/types";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import {
  isCoordinate,
  isDate,
  isDimension,
  isMetric,
} from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  DatasetData,
  RawSeries,
  SingleSeries,
} from "metabase-types/api";

export const MAX_SERIES = 100;
export const MAX_REASONABLE_SANKEY_DIMENSION_CARDINALITY = 100;

const SPLIT_AXIS_UNSPLIT_COST = -100;
const SPLIT_AXIS_COST_FACTOR = 2;
const SPLIT_AXIS_MAX_DEPTH = 8;

// NOTE Atte Keinänen 8/3/17: Moved from settings.js because this way we
// are able to avoid circular dependency errors in e2e tests
export function columnsAreValid(
  colNames: string | (string | null)[],
  data: DatasetData | null | undefined,
  filter: (col: DatasetColumn) => boolean = () => true,
): boolean {
  if (typeof colNames === "string") {
    colNames = [colNames];
  }
  if (!data || !Array.isArray(colNames)) {
    return false;
  }
  const colsByName: Record<string, DatasetColumn> = {};
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
function getComputedSizeProperty(prop: string, element: Element): number {
  const val = document.defaultView
    ?.getComputedStyle(element, null)
    .getPropertyValue(prop);
  return val ? parseFloat(val.replace("px", "")) : 0;
}

/// height available for rendering the card
export function getAvailableCanvasHeight(element: Element): number {
  const parent = element.parentElement;
  if (!parent) {
    return 0;
  }
  const parentHeight = getComputedSizeProperty("height", parent);
  const parentPaddingTop = getComputedSizeProperty("padding-top", parent);
  const parentPaddingBottom = getComputedSizeProperty("padding-bottom", parent);

  // NOTE: if this magic number is not 3 we can get into infinite re-render loops
  return parentHeight - parentPaddingTop - parentPaddingBottom - 3;
}

/// width available for rendering the card
export function getAvailableCanvasWidth(element: Element): number {
  const parent = element.parentElement;
  if (!parent) {
    return 0;
  }
  const parentWidth = getComputedSizeProperty("width", parent);
  const parentPaddingLeft = getComputedSizeProperty("padding-left", parent);
  const parentPaddingRight = getComputedSizeProperty("padding-right", parent);

  return parentWidth - parentPaddingLeft - parentPaddingRight;
}

function generateSplits(
  list: number[],
  left: number[] = [],
  right: number[] = [],
  depth = 0,
): [number[], number[]][] {
  if (list.length === 0) {
    return [[left, right]];
  } else if (depth > SPLIT_AXIS_MAX_DEPTH) {
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

function axisCost(
  seriesExtents: [number, number][],
  favorUnsplit = true,
): number {
  const axisExtent = d3.extent([].concat(...seriesExtents)) as [number, number];
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

export function computeSplit(
  extents: [number, number][],
  left: number[] = [],
  right: number[] = [],
): [number[], number[]] | undefined {
  const unassigned = extents
    .map((_e, i) => i)
    .filter((i) => left.indexOf(i) < 0 && right.indexOf(i) < 0);

  const favorUnsplit = right.length > 0;

  const cost = (split: [number[], number[]]) =>
    axisCost(
      split[0].map((i) => extents[i]),
      favorUnsplit,
    ) +
    axisCost(
      split[1].map((i) => extents[i]),
      favorUnsplit,
    );

  const splits = generateSplits(unassigned, left, right);

  let best: [number[], number[]] | undefined;
  let bestCost: number | undefined;
  for (const split of splits) {
    const splitCost = cost(split);
    if (!best || splitCost < bestCost!) {
      best = split;
      bestCost = splitCost;
    }
  }

  if (left.length > 0 || right.length > 0) {
    return best;
  } else {
    return best?.sort((a, b) => a[0] - b[0]);
  }
}

export function isSameSeries(
  seriesA: RawSeries | null | undefined,
  seriesB: RawSeries | null | undefined,
): boolean {
  return (
    (seriesA && seriesA.length) === (seriesB && seriesB.length) &&
    _.zip(seriesA, seriesB).reduce((acc, [a, b]) => {
      if (!a || !b) {
        return acc;
      }
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

export function colorShades(color: string, count: number): string[] {
  return _.range(count).map((i) =>
    colorShade(color, 1 - Math.min(0.25, 1 / count) * i),
  );
}

export function colorShade(hex: string, shade = 0): string {
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
const cardinalityCache = new Map<string, number>();

export function getColumnCardinality(
  cols: DatasetColumn[],
  rows: unknown[][] | null | undefined,
  index: number,
): number | undefined {
  const col = cols[index];
  const key = getColumnKey(col);
  if (!cardinalityCache.has(key) && rows) {
    const dataset = crossfilter(rows);
    cardinalityCache.set(
      key,
      dataset
        .dimension((d: unknown[]) => d[index])
        .group()
        .size(),
    );
  }
  return cardinalityCache.get(key);
}

const extentCache = new WeakMap<DatasetColumn, [number, number]>();

export function getColumnExtent(
  cols: DatasetColumn[],
  rows: unknown[][],
  index: number,
): [number, number] | undefined {
  const col = cols[index];
  if (!extentCache.has(col)) {
    extentCache.set(
      col,
      d3.extent(rows, (row: unknown[]) => row[index]) as [number, number],
    );
  }
  return extentCache.get(col);
}

export interface CardLike {
  id?: number | null;
  original_card_id?: number;
  dataset_query?: unknown;
  display?: string;
  [key: string]: unknown;
}

// TODO Atte Keinänen 5/30/17 Extract to metabase-lib card/question logic
export const cardHasBecomeDirty = (
  nextCard: CardLike,
  previousCard: CardLike,
): boolean =>
  !_.isEqual(previousCard.dataset_query, nextCard.dataset_query) ||
  previousCard.display !== nextCard.display;

export function getCardAfterVisualizationClick(
  nextCard: CardLike,
  previousCard: CardLike,
): CardLike {
  if (cardHasBecomeDirty(nextCard, previousCard)) {
    const isMultiseriesQuestion = !nextCard.id;
    const alreadyHadLineage = !!previousCard.original_card_id;

    return {
      ...nextCard,
      type: "question",
      original_card_id: alreadyHadLineage
        ? previousCard.original_card_id
        : isMultiseriesQuestion
          ? (previousCard.id ?? undefined)
          : (nextCard.id ?? undefined),
      id: null,
    };
  } else {
    return {
      ...nextCard,
      original_card_id: nextCard.id,
    };
  }
}

export function getDefaultDimensionAndMetric(series: RawSeries): {
  dimension: string | null;
  metric: string | null;
} {
  const columns = getDefaultDimensionsAndMetrics(series, 1, 1);
  return {
    dimension: columns.dimensions[0] ?? null,
    metric: columns.metrics[0] ?? null,
  };
}

export function getSingleSeriesDimensionsAndMetrics(
  series: SingleSeries,
  maxDimensions = 2,
  maxMetrics = Infinity,
): { dimensions: (string | null)[]; metrics: (string | null)[] } {
  const { data } = series;
  if (!data) {
    return {
      dimensions: [null],
      metrics: [null],
    };
  }

  const { cols, rows } = data;

  let dimensions: DatasetColumn[] = [];
  let metrics: DatasetColumn[] = [];

  // in MBQL queries that are broken out, metrics and dimensions are mutually exclusive
  // in SQL queries and raw MBQL queries metrics are numeric, summable, non-PK/FK and dimensions can be anything
  const metricColumns = cols.filter((col) => isMetric(col));
  const dimensionNotMetricColumns = cols.filter(
    (col) => isDimension(col) && !isMetric(col),
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
      dimensions.reverse();
    } else if (
      (getColumnCardinality(cols, rows, cols.indexOf(dimensions[0])) ?? 0) <
      (getColumnCardinality(cols, rows, cols.indexOf(dimensions[1])) ?? 0)
    ) {
      dimensions.reverse();
    }
  }

  if (
    dimensions.length > 1 &&
    (getColumnCardinality(cols, rows, cols.indexOf(dimensions[1])) ?? 0) >
      MAX_SERIES
  ) {
    dimensions.pop();
  }

  return {
    dimensions: dimensions.length > 0 ? dimensions.map((c) => c.name) : [null],
    metrics: metrics.length > 0 ? metrics.map((c) => c.name) : [null],
  };
}

export function getDefaultDimensionsAndMetrics(
  rawSeries: RawSeries,
  maxDimensions = 2,
  maxMetrics = Infinity,
): { dimensions: (string | null)[]; metrics: (string | null)[] } {
  return getSingleSeriesDimensionsAndMetrics(
    rawSeries[0],
    maxDimensions,
    maxMetrics,
  );
}

export function computeMaxDecimalsForValues(
  values: number[],
  options?: Intl.NumberFormatOptions,
): number | undefined {
  try {
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
  } catch {
    return undefined;
  }
}

export const preserveExistingColumnsOrder = <T>(
  prevColumns: T[] | null | undefined,
  newColumns: T[],
): T[] => {
  if (!prevColumns || prevColumns.length === 0) {
    return newColumns;
  }

  const newSet = new Set(newColumns);
  const prevSet = new Set(prevColumns);

  const addedColumns = newColumns.filter((column) => !prevSet.has(column));
  const prevOrderedColumnsExceptRemoved = prevColumns.map((column) =>
    newSet.has(column) ? column : null,
  );

  const mergedColumnsResult: T[] = [];

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

export function getCardKey(cardId: number | null | undefined): string {
  return `${cardId ?? "unsaved"}`;
}

const PIVOT_SENSIBLE_MAX_CARDINALITY = 16;

export const getDefaultPivotColumn = (
  cols: DatasetColumn[],
  rows: unknown[][],
): DatasetColumn | null => {
  const columnsWithCardinality = cols
    .map((column, index) => {
      if (!isDimension(column)) {
        return null;
      }

      const cardinality = getColumnCardinality(cols, rows, index);
      if (cardinality == null || cardinality > PIVOT_SENSIBLE_MAX_CARDINALITY) {
        return null;
      }

      return { column, cardinality };
    })
    .filter(isNotNull) as { column: DatasetColumn; cardinality: number }[];

  return (
    _.min(columnsWithCardinality, ({ cardinality }) => cardinality)?.column ??
    null
  );
};

const MAX_SANKEY_COLUMN_PAIRS_TO_CHECK = 6;

interface DimensionColumnWithIndex {
  column: DatasetColumn;
  index: number;
  cardinality: number;
}

function findSankeyColumnPair(
  dimensionColumns: DimensionColumnWithIndex[],
  rows: unknown[][],
): { source: string; target: string } | null {
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

export function findSensibleSankeyColumns(
  data: DatasetData | null | undefined,
): {
  source: string;
  target: string;
  metric: string;
} | null {
  if (!data?.cols || !data?.rows) {
    return null;
  }

  const { cols, rows } = data;

  const { dimensionColumns, metricColumn } = cols.reduce(
    (
      acc: {
        dimensionColumns: DimensionColumnWithIndex[];
        metricColumn: DatasetColumn | null;
      },
      col,
      index,
    ) => {
      if (isMetric(col)) {
        if (!acc.metricColumn) {
          acc.metricColumn = col;
        }
      } else if (isDimension(col) && !isDate(col) && !isCoordinate(col)) {
        // Limited quick cardinality check before doing full computation
        const uniqueValues = new Set<unknown>();
        const rowsToQuickCheck = Math.min(
          rows.length,
          MAX_REASONABLE_SANKEY_DIMENSION_CARDINALITY * 1.5,
        );
        for (let i = 0; i < rowsToQuickCheck; i++) {
          uniqueValues.add(rows[i][index]);
        }

        if (
          uniqueValues.size > 0 &&
          uniqueValues.size <= MAX_REASONABLE_SANKEY_DIMENSION_CARDINALITY
        ) {
          const cardinality = getColumnCardinality(cols, rows, index);
          if (
            cardinality != null &&
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

export const segmentIsValid = (
  segment: { min?: unknown; max?: unknown },
  { allowOpenEnded = false }: { allowOpenEnded?: boolean } = {},
): boolean => {
  const hasMin =
    typeof segment.min === "number" && Number.isFinite(segment.min);
  const hasMax =
    typeof segment.max === "number" && Number.isFinite(segment.max);
  return allowOpenEnded ? hasMin || hasMax : hasMin && hasMax;
};
