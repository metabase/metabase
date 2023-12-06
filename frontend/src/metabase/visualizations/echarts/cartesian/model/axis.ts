import d3 from "d3";
import _ from "underscore";
import type {
  AxisExtent,
  AxisExtents,
  DataKey,
  Extent,
  GroupedDataset,
  SeriesExtents,
  SeriesModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { SeriesSettings } from "metabase-types/api";
import { isNotNull } from "metabase/lib/types";

const KEYS_TO_COMPARE = new Set([
  "number_style",
  "currency",
  "currency_style",
  "number_separators",
  "decimals",
  "scale",
  "prefix",
  "suffix",
]);

export function getLineAreaBarComparisonSettings(
  columnSettings: Record<string, unknown>,
) {
  return _.pick(columnSettings, (value, key) => {
    if (!KEYS_TO_COMPARE.has(key)) {
      return false;
    }
    if ((key === "prefix" || key === "suffix") && value === "") {
      return false;
    }
    return true;
  });
}

const getAggregateColumnsCount = (seriesModels: SeriesModel[]) => {
  return _.uniq(
    seriesModels
      .map(seriesModel => seriesModel.column)
      .filter(column => column.source === "aggregation")
      .map(column => column.name),
  ).length;
};

export function shouldAutoSplitYAxis(
  settings: ComputedVisualizationSettings,
  seriesModels: SeriesModel[],
  seriesExtents: SeriesExtents,
) {
  const hasSingleCard =
    seriesModels.reduce((cardIds, seriesModel) => {
      cardIds.add(seriesModel.cardId);
      return cardIds;
    }, new Set<number | undefined>()).size === 1;

  if (
    settings["graph.y_axis.auto_split"] === false ||
    (hasSingleCard && getAggregateColumnsCount(seriesModels) < 2) ||
    settings["stackable.stack_type"] != null
  ) {
    return false;
  }

  const allMetricsColumns = seriesModels.map(seriesModel => seriesModel.column);

  const hasDifferentYAxisColTypes =
    _.uniq(allMetricsColumns.map(column => column.semantic_type)).length > 1;

  if (hasDifferentYAxisColTypes) {
    return true;
  }

  const allMetricsColumnSettings = allMetricsColumns
    .map(column => settings.column?.(column))
    .filter(isNotNull);

  const columnSettings = allMetricsColumnSettings.map(columnSettings =>
    getLineAreaBarComparisonSettings(columnSettings),
  );

  const hasDifferentColumnSettings = columnSettings.some(s1 =>
    columnSettings.some(s2 => !_.isEqual(s1, s2)),
  );

  if (hasDifferentColumnSettings) {
    return true;
  }

  const yExtents = Object.values(seriesExtents);

  const minRange = Math.min(...yExtents.map(extent => extent[1] - extent[0]));
  const maxExtent = Math.max(...yExtents.map(extent => extent[1]));
  const minExtent = Math.min(...yExtents.map(extent => extent[0]));
  const chartRange = maxExtent - minExtent;

  // Note (EmmadUsmani): When the series with the smallest range is less than 5%
  // of the chart's total range, we split the y-axis so it doesn't look too small.
  return minRange / chartRange <= 0.05;
}

type AxisSplit = [DataKey[], DataKey[]];

const SPLIT_AXIS_UNSPLIT_COST = -100;
const SPLIT_AXIS_COST_FACTOR = 2;
const SPLIT_AXIS_MAX_DEPTH = 8;

function generateSplits(
  list: DataKey[],
  left: DataKey[] = [],
  right: DataKey[] = [],
  depth = 0,
): AxisSplit[] {
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

function axisCost(extents: Extent[], favorUnsplit = true) {
  const axisExtent = d3.extent(extents.flatMap(e => e));
  const axisRange = axisExtent[1] - axisExtent[0];
  if (favorUnsplit && extents.length === 0) {
    return SPLIT_AXIS_UNSPLIT_COST;
  } else if (axisRange === 0) {
    return 0;
  } else {
    return extents.reduce(
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
  extents: SeriesExtents,
  left: DataKey[] = [],
  right: DataKey[] = [],
): AxisSplit {
  const unassigned: DataKey[] = Object.keys(extents).filter(
    key => left.indexOf(key) < 0 && right.indexOf(key) < 0,
  );

  // if any are assigned to right we have decided to split so don't favor unsplit
  const favorUnsplit = right.length > 0;

  const cost = (split: [DataKey[], DataKey[]]) =>
    axisCost(
      split[0].map(dataKey => extents[dataKey]),
      favorUnsplit,
    ) +
    axisCost(
      split[1].map(dataKey => extents[dataKey]),
      favorUnsplit,
    );

  const splits = generateSplits(unassigned, left, right);

  let best: AxisSplit = [[], []];
  let bestCost = Infinity;
  for (const split of splits) {
    const splitCost = cost(split);
    if (!best || splitCost < bestCost) {
      best = split;
      bestCost = splitCost;
    }
  }

  return best;
}

export const getYAxisSplit = (
  seriesModels: SeriesModel[],
  seriesExtents: SeriesExtents,
  settings: ComputedVisualizationSettings,
  isAutoSplitSupported: boolean,
): AxisSplit => {
  const axisBySeriesKey = seriesModels.reduce((acc, seriesModel) => {
    const seriesSettings: SeriesSettings = settings.series(
      seriesModel.legacySeriesSettingsObjectKey,
    );

    acc[seriesModel.dataKey] = seriesSettings?.["axis"];
    return acc;
  }, {} as Record<string, string | undefined>);

  const left = [];
  const right = [];
  const auto = [];
  for (const [dataKey, axis] of Object.entries(axisBySeriesKey)) {
    if (axis === "left") {
      left.push(dataKey);
    } else if (axis === "right") {
      right.push(dataKey);
    } else {
      auto.push(dataKey);
    }
  }

  if (
    isAutoSplitSupported &&
    shouldAutoSplitYAxis(settings, seriesModels, seriesExtents)
  ) {
    // NOTE: this version computes the split after assigning fixed left/right
    // which causes other series to move around when changing the setting
    // return computeSplit(yExtents, left, right);

    // NOTE: this version computes a split with all axis unassigned, then moves
    // assigned ones to their correct axis
    const [autoLeft, autoRight] = computeSplit(seriesExtents);
    return [
      _.uniq([
        ...left,
        ...autoLeft.filter(dataKey => !axisBySeriesKey[dataKey]),
      ]),
      _.uniq([
        ...right,
        ...autoRight.filter(dataKey => !axisBySeriesKey[dataKey]),
      ]),
    ];
  } else {
    // assign all auto to the left
    return [[...left, ...auto], right];
  }
};

const calculateStackedExtent = (
  seriesKeys: DataKey[],
  data: GroupedDataset,
): AxisExtent => {
  if (seriesKeys.length === 0) {
    return null;
  }

  let min = 0;
  let max = 0;

  data.forEach(entry => {
    let positiveStack = 0;
    let negativeStack = 0;
    seriesKeys.forEach(key => {
      const value = entry[key];
      if (typeof value === "number") {
        if (value >= 0) {
          positiveStack += value;
        } else {
          negativeStack += value;
        }
      }
    });
    min = Math.min(min, negativeStack);
    max = Math.max(max, positiveStack);
  });

  return [min, max];
};

function calculateNonStackedExtent(
  seriesKeys: DataKey[],
  data: GroupedDataset,
): AxisExtent {
  if (seriesKeys.length === 0) {
    return null;
  }

  let min = Infinity;
  let max = -Infinity;

  data.forEach(entry => {
    seriesKeys.forEach(key => {
      const value = entry[key];
      if (typeof value === "number") {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    });
  });

  if (min === Infinity || max === -Infinity) {
    return null;
  }

  return [min, max];
}

const NORMALIZED_RANGE: Extent = [0, 1];

export function getYAxesExtents(
  axisSplit: [DataKey[], DataKey[]],
  data: GroupedDataset,
  settings: ComputedVisualizationSettings,
): AxisExtents {
  if (data.length === 0) {
    return [null, null];
  }

  const [leftAxisKeys, rightAxisKeys] = axisSplit;

  const isNormalizedStacking =
    settings["stackable.stack_type"] === "normalized";

  if (isNormalizedStacking) {
    return [
      leftAxisKeys.length > 0 ? NORMALIZED_RANGE : null,
      rightAxisKeys.length > 0 ? NORMALIZED_RANGE : null,
    ];
  }

  const isStacked = settings["stackable.stack_type"] === "stacked";

  const leftAxisExtent = isStacked
    ? calculateStackedExtent(leftAxisKeys, data)
    : calculateNonStackedExtent(leftAxisKeys, data);

  const rightAxisExtent = isStacked
    ? calculateStackedExtent(rightAxisKeys, data)
    : calculateNonStackedExtent(rightAxisKeys, data);

  return [leftAxisExtent, rightAxisExtent];
}
