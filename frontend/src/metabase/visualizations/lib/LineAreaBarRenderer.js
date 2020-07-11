/* @flow weak */

import crossfilter from "crossfilter";
import d3 from "d3";
import dc from "dc";
import _ from "underscore";
import { assocIn, updateIn } from "icepick";
import { t } from "ttag";
import { lighten } from "metabase/lib/colors";

import Question from "metabase-lib/lib/Question";

import {
  computeSplit,
  computeMaxDecimalsForValues,
  getFriendlyName,
  colorShades,
} from "./utils";

import {
  minTimeseriesUnit,
  computeTimeseriesDataInverval,
  getTimezone,
} from "./timeseries";

import { computeNumericDataInverval } from "./numeric";

import {
  applyChartTimeseriesXAxis,
  applyChartQuantitativeXAxis,
  applyChartOrdinalXAxis,
  applyChartYAxis,
  getYValueFormatter,
} from "./apply_axis";

import { setupTooltips } from "./apply_tooltips";
import { getTrendDataPointsFromInsight } from "./trends";

import fillMissingValuesInDatas from "./fill_data";
import { NULL_DIMENSION_WARNING, unaggregatedDataWarning } from "./warnings";

import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";

import {
  forceSortedGroupsOfGroups,
  initChart, // TODO - probably better named something like `initChartParent`
  makeIndexMap,
  reduceGroup,
  isTimeseries,
  isQuantitative,
  isHistogram,
  isOrdinal,
  isHistogramBar,
  isStacked,
  isNormalized,
  getDatas,
  getFirstNonEmptySeries,
  getXValues,
  isDimensionTimeseries,
  isRemappedToString,
  isMultiCardSeries,
} from "./renderer_utils";

import lineAndBarOnRender from "./LineAreaBarPostRender";

import { isStructured } from "metabase/meta/Card";

import {
  updateDateTimeFilter,
  updateNumericFilter,
} from "metabase/modes/lib/actions";

import { lineAddons } from "./graph/addons";
import { initBrush } from "./graph/brush";

import type { VisualizationProps } from "metabase-types/types/Visualization";

const BAR_PADDING_RATIO = 0.2;
const DEFAULT_INTERPOLATION = "linear";

const enableBrush = (series, onChangeCardAndRun) =>
  !!(
    onChangeCardAndRun &&
    !isMultiCardSeries(series) &&
    isStructured(series[0].card) &&
    !isRemappedToString(series)
  );

/************************************************************ SETUP ************************************************************/

function checkSeriesIsValid({ series, maxSeries }) {
  if (getFirstNonEmptySeries(series).data.cols.length < 2) {
    throw new Error(t`This chart type requires at least 2 columns.`);
  }

  if (series.length > maxSeries) {
    throw new Error(
      t`This chart type doesn't support more than ${maxSeries} series of data.`,
    );
  }
}

function getXInterval({ settings, series }, xValues, warn) {
  if (isTimeseries(settings)) {
    // We need three pieces of information to define a timeseries range:
    // 1. interval - it's really the "unit": month, day, etc
    // 2. count - how many intervals per tick?
    // 3. timezone - what timezone are values in? days vary in length by timezone
    const unit = minTimeseriesUnit(series.map(s => s.data.cols[0].unit));
    const timezone = getTimezone(series, warn);
    const { count, interval } = computeTimeseriesDataInverval(xValues, unit);
    return { count, interval, timezone };
  } else if (isQuantitative(settings) || isHistogram(settings)) {
    // Get the bin width from binning_info, if available
    // TODO: multiseries?
    const binningInfo = getFirstNonEmptySeries(series).data.cols[0]
      .binning_info;
    if (binningInfo) {
      return binningInfo.bin_width;
    }

    // Otherwise try to infer from the X values
    return computeNumericDataInverval(xValues);
  }
}

function getXAxisProps(props, datas, warn) {
  const rawXValues = getXValues(props);
  const isHistogram = isHistogramBar(props);
  const xInterval = getXInterval(props, rawXValues, warn);

  // For histograms we add a fake x value one xInterval to the right
  // This compensates for the barshifting we do align ticks
  const xValues = isHistogram
    ? [...rawXValues, Math.max(...rawXValues) + xInterval]
    : rawXValues;
  return {
    isHistogramBar: isHistogram,
    xDomain: d3.extent(xValues),
    xInterval,
    xValues,
  };
}

///------------------------------------------------------------ DIMENSIONS & GROUPS ------------------------------------------------------------///

function getDimensionsAndGroupsForScatterChart(datas) {
  const dataset = crossfilter();
  datas.map(data => dataset.add(data));

  const dimension = dataset.dimension(row => row);
  const groups = datas.map(data => {
    const dim = crossfilter(data).dimension(row => row);
    return [dim.group().reduceSum(d => d[2] || 1)];
  });

  return { dimension, groups };
}

/// Add '% ' in from of the names of the appropriate series. E.g. 'Sum' becomes '% Sum'
function addPercentSignsToDisplayNames(series) {
  return series.map(s =>
    updateIn(s, ["data", "cols", 1], col => ({
      ...col,
      display_name: "% " + getFriendlyName(col),
    })),
  );
}

// Store a "decimals" property on the column that is normalized
function addDecimalsToPercentColumn(series, decimals) {
  return series.map(s => assocIn(s, ["data", "cols", 1, "decimals"], decimals));
}

function getDimensionsAndGroupsAndUpdateSeriesDisplayNamesForStackedChart(
  props,
  datas,
  warn,
) {
  const dataset = crossfilter();

  const normalized = isNormalized(props.settings, datas);
  // get the sum of the metric for each dimension value in order to scale
  const scaleFactors = {};
  if (normalized) {
    for (const data of datas) {
      for (const [d, m] of data) {
        scaleFactors[d] = (scaleFactors[d] || 0) + m;
      }
    }

    props.series = addPercentSignsToDisplayNames(props.series);

    const normalizedValues = datas.flatMap(data =>
      data.map(([d, m]) => m / scaleFactors[d]),
    );
    const decimals = computeMaxDecimalsForValues(normalizedValues, {
      style: "percent",
      maximumSignificantDigits: 2,
    });
    props.series = addDecimalsToPercentColumn(props.series, decimals);
  }

  datas.map((data, i) =>
    dataset.add(
      data.map(d => ({
        [0]: d[0],
        [i + 1]: normalized ? d[1] / scaleFactors[d[0]] : d[1],
      })),
    ),
  );

  const dimension = dataset.dimension(d => d[0]);
  const groups = [
    datas.map((data, seriesIndex) =>
      reduceGroup(dimension.group(), seriesIndex + 1, () =>
        warn(unaggregatedDataWarning(props.series[seriesIndex].data.cols[0])),
      ),
    ),
  ];

  return { dimension, groups };
}

function getDimensionsAndGroupsForOther({ series }, datas, warn) {
  const dataset = crossfilter();
  datas.map(data => dataset.add(data));

  const dimension = dataset.dimension(d => d[0]);
  const groups = datas.map((data, seriesIndex) => {
    // If the value is empty, pass a dummy array to crossfilter
    data = data.length > 0 ? data : [[null, null]];

    const dim = crossfilter(data).dimension(d => d[0]);

    return data[0]
      .slice(1)
      .map((_, metricIndex) =>
        reduceGroup(dim.group(), metricIndex + 1, () =>
          warn(unaggregatedDataWarning(series[seriesIndex].data.cols[0])),
        ),
      );
  });

  return { dimension, groups };
}

function getYExtentsForGroups(groups) {
  return groups.map(group => {
    const sums = new Map();
    for (const g of group) {
      for (const { key, value } of g.all()) {
        const prevValue = sums.get(key) || 0;
        sums.set(key, prevValue + value);
      }
    }
    return d3.extent(Array.from(sums.values()));
  });
}

/// Return an object containing the `dimension` and `groups` for the chart(s).
/// For normalized stacked charts, this also updates the dispaly names to add a percent in front of the name (e.g. 'Sum' becomes '% Sum')
/// This is only exported for testing.
export function getDimensionsAndGroupsAndUpdateSeriesDisplayNames(
  props,
  datas,
  warn,
) {
  const { settings, chartType } = props;

  const { groups, dimension } =
    chartType === "scatter"
      ? getDimensionsAndGroupsForScatterChart(datas)
      : isStacked(settings, datas)
      ? getDimensionsAndGroupsAndUpdateSeriesDisplayNamesForStackedChart(
          props,
          datas,
          warn,
        )
      : getDimensionsAndGroupsForOther(props, datas, warn);
  const yExtents = getYExtentsForGroups(groups);
  return { groups, dimension, yExtents };
}

///------------------------------------------------------------ Y AXIS PROPS ------------------------------------------------------------///

function getYAxisSplit(
  { settings, chartType, isScalarSeries, series },
  datas,
  yExtents,
) {
  const seriesAxis = series.map(single => settings.series(single)["axis"]);
  const left = [];
  const right = [];
  const auto = [];
  for (const [index, axis] of seriesAxis.entries()) {
    if (axis === "left") {
      left.push(index);
    } else if (axis === "right") {
      right.push(index);
    } else {
      auto.push(index);
    }
  }

  // don't auto-split if the metric columns are all identical, i.e. it's a breakout multiseries
  const hasDifferentYAxisColumns =
    _.uniq(series.map(s => JSON.stringify(s.data.cols[1]))).length > 1;
  if (
    !isScalarSeries &&
    chartType !== "scatter" &&
    !isStacked(settings, datas) &&
    hasDifferentYAxisColumns &&
    settings["graph.y_axis.auto_split"] !== false
  ) {
    // NOTE: this version computes the split after assigning fixed left/right
    // which causes other series to move around when changing the setting
    // return computeSplit(yExtents, left, right);

    // NOTE: this version computes a split with all axis unassigned, then moves
    // assigned ones to their correct axis
    const [autoLeft, autoRight] = computeSplit(yExtents);
    return [
      _.uniq([...left, ...autoLeft.filter(index => !seriesAxis[index])]),
      _.uniq([...right, ...autoRight.filter(index => !seriesAxis[index])]),
    ];
  } else {
    // assign all auto to the left
    return [[...left, ...auto], right];
  }
}

function getYAxisSplitLeftAndRight(series, yAxisSplit, yExtents) {
  return yAxisSplit.map(indexes => ({
    series: indexes.map(index => series[index]),
    extent: d3.extent([].concat(...indexes.map(index => yExtents[index]))),
  }));
}

function getIsSplitYAxis(left, right) {
  return right && right.series.length && (left && left.series.length > 0);
}

function getYAxisProps(props, yExtents, datas) {
  const yAxisSplit = getYAxisSplit(props, datas, yExtents);

  const [yLeftSplit, yRightSplit] = getYAxisSplitLeftAndRight(
    props.series,
    yAxisSplit,
    yExtents,
  );

  return {
    yExtents,
    yAxisSplit,
    yExtent: d3.extent([].concat(...yExtents)),
    yLeftSplit,
    yRightSplit,
    isSplit: getIsSplitYAxis(yLeftSplit, yRightSplit),
  };
}

/// make the `onBrushChange()` and `onBrushEnd()` functions we'll use later, as well as an `isBrushing()` function to check
/// current status.
function makeBrushChangeFunctions({ series, onChangeCardAndRun }) {
  let _isBrushing = false;

  const isBrushing = () => _isBrushing;

  function onBrushChange() {
    _isBrushing = true;
  }

  function onBrushEnd(range) {
    _isBrushing = false;
    if (range) {
      const column = series[0].data.cols[0];
      const card = series[0].card;
      // $FlowFixMe: Question requires Metadata but we don't actually need it in this case
      const query = new Question(card).query();
      const [start, end] = range;
      if (isDimensionTimeseries(series)) {
        onChangeCardAndRun({
          nextCard: updateDateTimeFilter(query, column, start, end)
            .question()
            .card(),
          previousCard: card,
        });
      } else {
        onChangeCardAndRun({
          nextCard: updateNumericFilter(query, column, start, end)
            .question()
            .card(),
          previousCard: card,
        });
      }
    }
  }

  return { isBrushing, onBrushChange, onBrushEnd };
}

/************************************************************ INDIVIDUAL CHART SETUP ************************************************************/

function getDcjsChart(cardType, parent) {
  switch (cardType) {
    case "line":
      return lineAddons(dc.lineChart(parent));
    case "area":
      return lineAddons(dc.lineChart(parent));
    case "bar":
      return dc.barChart(parent);
    case "scatter":
      return dc.bubbleChart(parent);
    default:
      return dc.barChart(parent);
  }
}

function applyChartLineBarSettings(
  chart,
  settings,
  chartType,
  seriesSettings,
  forceCenterBar,
) {
  // LINE/AREA:
  // for chart types that have an 'interpolate' option (line/area charts), enable based on settings
  if (chart.interpolate) {
    chart.interpolate(
      seriesSettings["line.interpolate"] ||
        settings["line.interpolate"] ||
        DEFAULT_INTERPOLATION,
    );
  }

  // AREA:
  if (chart.renderArea) {
    chart.renderArea(chartType === "area");
  }

  // BAR:
  if (chart.barPadding) {
    chart
      .barPadding(BAR_PADDING_RATIO)
      .centerBar(
        forceCenterBar || settings["graph.x_axis.scale"] !== "ordinal",
      );
  }
}

// TODO - give this a good name when I figure out what it does
function doScatterChartStuff(chart, datas, index, { yExtent, yExtents }) {
  chart.keyAccessor(d => d.key[0]).valueAccessor(d => d.key[1]);

  if (chart.radiusValueAccessor) {
    const isBubble = datas[index][0].length > 2;
    if (isBubble) {
      const BUBBLE_SCALE_FACTOR_MAX = 64;
      chart
        .radiusValueAccessor(d => d.value)
        .r(
          d3.scale
            .sqrt()
            .domain([0, yExtent[1] * BUBBLE_SCALE_FACTOR_MAX])
            .range([0, 1]),
        );
    } else {
      chart.radiusValueAccessor(d => 1);
      chart.MIN_RADIUS = 3;
    }
    chart.minRadiusWithLabel(Infinity);
  }
}

/// set the colors for a CHART based on the number of series and type of chart
/// see http://dc-js.github.io/dc.js/docs/html/dc.colorMixin.html
function setChartColor({ series, settings, chartType }, chart, groups, index) {
  const group = groups[index];
  const colorsByKey = settings["series_settings.colors"] || {};
  const key = keyForSingleSeries(series[index]);
  const color = colorsByKey[key] || "black";

  // multiple series
  if (groups.length > 1 || chartType === "scatter") {
    // multiple stacks
    if (group.length > 1) {
      // compute shades of the assigned color
      chart.ordinalColors(colorShades(color, group.length));
    } else {
      chart.colors(color);
    }
  } else {
    chart.ordinalColors(
      series.map(single => colorsByKey[keyForSingleSeries(single)]),
    );
  }
}

// returns the series "display" type, either from the series settings or stack_display setting
function getSeriesDisplay(settings, single) {
  if (settings["stackable.stack_type"] != null) {
    return settings["stackable.stack_display"];
  } else {
    return settings.series(single).display;
  }
}

/// Return a sequence of little charts for each of the groups.
function getCharts(
  props,
  yAxisProps,
  parent,
  datas,
  groups,
  dimension,
  { onBrushChange, onBrushEnd },
) {
  const { settings, chartType, series, onChangeCardAndRun } = props;
  const { yAxisSplit } = yAxisProps;

  const isHeterogenous =
    _.uniq(series.map(single => getSeriesDisplay(settings, single))).length > 1;
  const isHeterogenousOrdinal =
    settings["graph.x_axis.scale"] === "ordinal" && isHeterogenous;

  if (isHeterogenousOrdinal) {
    // HACK: ordinal + mix of line and bar results in uncentered points, shift by
    // half the width
    parent.on("renderlet.shift", () => {
      // ordinal, so we can get the first two points to determine spacing
      const scale = parent.x();
      const values = scale.domain();
      const spacing = scale(values[1]) - scale(values[0]);
      parent
        .svg()
        // shift bar/line and dots
        .selectAll(".stack, .dc-tooltip")
        .each(function() {
          this.setAttribute("transform", `translate(${spacing / 2}, 0)`);
        });
    });
  }

  return groups.map((group, index) => {
    const single = series[index];
    const seriesSettings = settings.series(single);
    const seriesChartType = getSeriesDisplay(settings, single) || chartType;

    const chart = getDcjsChart(seriesChartType, parent);

    if (enableBrush(series, onChangeCardAndRun)) {
      initBrush(parent, chart, onBrushChange, onBrushEnd);
    }

    // disable clicks
    chart.onClick = () => {};

    chart
      .dimension(dimension)
      .group(group[0])
      .transitionDuration(0)
      .useRightYAxis(yAxisSplit.length > 1 && yAxisSplit[1].includes(index));

    if (chartType === "scatter") {
      doScatterChartStuff(chart, datas, index, yAxisProps);
    }

    if (chart.defined) {
      chart.defined(
        seriesSettings["line.missing"] === "none"
          ? d => d.y != null
          : d => true,
      );
    }

    setChartColor(props, chart, groups, index);

    for (let i = 1; i < group.length; i++) {
      chart.stack(group[i]);
    }

    applyChartLineBarSettings(
      chart,
      settings,
      seriesChartType,
      seriesSettings,
      isHeterogenousOrdinal,
    );

    return chart;
  });
}

/************************************************************ OTHER SETUP ************************************************************/

/// Add a `goalChart` to the end of `charts`, and return an appropriate `onGoalHover` function as needed.
function addGoalChartAndGetOnGoalHover(
  { settings, onHoverChange },
  xDomain,
  parent,
  charts,
) {
  if (!settings["graph.show_goal"]) {
    return () => {};
  }

  const goalValue = settings["graph.goal_value"];
  const goalData = [[xDomain[0], goalValue], [xDomain[1], goalValue]];
  const goalDimension = crossfilter(goalData).dimension(d => d[0]);

  // Take the last point rather than summing in case xDomain[0] === xDomain[1], e.x. when the chart
  // has just a single row / datapoint
  const goalGroup = goalDimension
    .group()
    .reduce((p, d) => d[1], (p, d) => p, () => 0);
  const goalIndex = charts.length;

  const goalChart = dc
    .lineChart(parent)
    .dimension(goalDimension)
    .group(goalGroup)
    .on("renderlet", function(chart) {
      // remove "sub" class so the goal is not used in voronoi computation
      chart
        .select(".sub._" + goalIndex)
        .classed("sub", false)
        .classed("goal", true);
    });
  charts.push(goalChart);

  return element => {
    onHoverChange(
      element && {
        element,
        data: [{ key: settings["graph.goal_label"], value: goalValue }],
      },
    );
  };
}

function findSeriesIndexForColumnName(series, colName) {
  return (
    _.findIndex(series, ({ data: { cols } }) =>
      _.findWhere(cols, { name: colName }),
    ) || 0
  );
}

const TREND_LINE_POINT_SPACING = 25;

function addTrendlineChart(
  { series, settings, onHoverChange },
  { xDomain },
  { yAxisSplit },
  parent,
  charts,
) {
  if (!settings["graph.show_trendline"]) {
    return;
  }

  const rawSeries = series._raw || series;
  const insights = rawSeries[0].data.insights || [];

  for (const insight of insights) {
    if (insight.slope != null && insight.offset != null) {
      const index = findSeriesIndexForColumnName(series, insight.col);
      const seriesSettings = settings.series(series[index]);
      const color = lighten(seriesSettings.color, 0.25);

      const points = Math.round(parent.width() / TREND_LINE_POINT_SPACING);
      const trendData = getTrendDataPointsFromInsight(insight, xDomain, points);
      const trendDimension = crossfilter(trendData).dimension(d => d[0]);

      // Take the last point rather than summing in case xDomain[0] === xDomain[1], e.x. when the chart
      // has just a single row / datapoint
      const trendGroup = trendDimension
        .group()
        .reduce((p, d) => d[1], (p, d) => p, () => 0);
      const trendIndex = charts.length;

      const trendChart = dc
        .lineChart(parent)
        .dimension(trendDimension)
        .group(trendGroup)
        .on("renderlet", function(chart) {
          // remove "sub" class so the trend is not used in voronoi computation
          chart
            .select(".sub._" + trendIndex)
            .classed("sub", false)
            .classed("trend", true);
        })
        .colors([color])
        .useRightYAxis(yAxisSplit.length > 1 && yAxisSplit[1].includes(index))
        .interpolate("cardinal");

      charts.push(trendChart);
    }
  }
}

function applyXAxisSettings(parent, series, xAxisProps) {
  if (isTimeseries(parent.settings)) {
    applyChartTimeseriesXAxis(parent, series, xAxisProps);
  } else if (isQuantitative(parent.settings)) {
    applyChartQuantitativeXAxis(parent, series, xAxisProps);
  } else {
    applyChartOrdinalXAxis(parent, series, xAxisProps);
  }
}

function applyYAxisSettings(parent, { yLeftSplit, yRightSplit }) {
  if (yLeftSplit && yLeftSplit.series.length > 0) {
    applyChartYAxis(parent, yLeftSplit.series, yLeftSplit.extent, "left");
  }
  if (yRightSplit && yRightSplit.series.length > 0) {
    applyChartYAxis(parent, yRightSplit.series, yRightSplit.extent, "right");
  }
}

// TODO - better name
function doGroupedBarStuff(parent) {
  parent.on("renderlet.grouped-bar", function(chart) {
    // HACK: dc.js doesn't support grouped bar charts so we need to manually resize/reposition them
    // https://github.com/dc-js/dc.js/issues/558
    const barCharts = chart
      .selectAll(".sub rect:first-child")[0]
      .map(node => node.parentNode.parentNode.parentNode);
    if (barCharts.length === 0) {
      return;
    }
    const bars = barCharts[0].querySelectorAll("rect");
    if (bars.length < 1) {
      return;
    }
    const oldBarWidth = parseFloat(bars[0].getAttribute("width"));
    const newBarWidthTotal = oldBarWidth / barCharts.length;
    const seriesPadding =
      newBarWidthTotal < 4 ? 0 : newBarWidthTotal < 8 ? 1 : 2;
    const newBarWidth = Math.max(1, newBarWidthTotal - seriesPadding);

    chart.selectAll("g.sub rect").attr("width", newBarWidth);
    barCharts.forEach((barChart, index) => {
      barChart.setAttribute(
        "transform",
        "translate(" + (newBarWidth + seriesPadding) * index + ", 0)",
      );
    });
  });
}

// TODO - better name
function doHistogramBarStuff(parent) {
  parent.on("renderlet.histogram-bar", function(chart) {
    // manually size bars to fill space, minus 1 pixel padding
    const barCharts = chart
      .selectAll(".sub rect:first-child")[0]
      .map(node => node.parentNode.parentNode.parentNode);
    if (barCharts.length === 0) {
      return;
    }
    const bars = barCharts[0].querySelectorAll("rect");
    if (bars.length < 2) {
      return;
    }
    const barWidth = parseFloat(bars[0].getAttribute("width"));
    const newBarWidth =
      parseFloat(bars[1].getAttribute("x")) -
      parseFloat(bars[0].getAttribute("x")) -
      1;
    if (newBarWidth > barWidth) {
      chart.selectAll("g.sub .bar").attr("width", newBarWidth);
    }

    // shift half of bar width so ticks line up with start of each bar
    for (const barChart of barCharts) {
      barChart.setAttribute("transform", `translate(${barWidth / 2}, 0)`);
    }
  });
}

/************************************************************ PUTTING IT ALL TOGETHER ************************************************************/

type LineAreaBarProps = VisualizationProps & {
  chartType: "line" | "area" | "bar" | "scatter",
  isScalarSeries: boolean,
  maxSeries: number,
};

type DeregisterFunction = () => void;

export default function lineAreaBar(
  element: Element,
  props: LineAreaBarProps,
): DeregisterFunction {
  const { onRender, isScalarSeries, settings, series } = props;

  const warnings = {};
  // `text` is displayed to users, but we deduplicate based on `key`
  // Call `warn` for each row-level issue, but only the first of each type is displayed.
  const warn = ({ key, text }) => {
    warnings[key] = warnings[key] || text;
  };

  checkSeriesIsValid(props);

  // force histogram to be ordinal axis with zero-filled missing points
  settings["graph.x_axis._scale_original"] = settings["graph.x_axis.scale"];
  if (isHistogram(settings)) {
    // FIXME: need to handle this on series settings now
    settings["line.missing"] = "zero";
    settings["graph.x_axis.scale"] = "ordinal";
  }

  let datas = getDatas(props, warn);
  let xAxisProps = getXAxisProps(props, datas, warn);

  datas = fillMissingValuesInDatas(props, xAxisProps, datas);
  xAxisProps = getXAxisProps(props, datas, warn);

  if (isScalarSeries) {
    xAxisProps.xValues = datas.map(data => data[0][0]);
  } // TODO - what is this for?

  const {
    dimension,
    groups,
    yExtents,
  } = getDimensionsAndGroupsAndUpdateSeriesDisplayNames(props, datas, warn);

  const yAxisProps = getYAxisProps(props, yExtents, datas);

  // Don't apply to linear or timeseries X-axis since the points are always plotted in order
  if (!isTimeseries(settings) && !isQuantitative(settings)) {
    forceSortedGroupsOfGroups(groups, makeIndexMap(xAxisProps.xValues));
  }

  const parent = dc.compositeChart(element);
  initChart(parent, element);

  // add these convienence aliases so we don't have to pass a bunch of things around
  parent.props = props;
  parent.settings = settings;
  parent.series = props.series;

  const brushChangeFunctions = makeBrushChangeFunctions(props);

  const charts = getCharts(
    props,
    yAxisProps,
    parent,
    datas,
    groups,
    dimension,
    brushChangeFunctions,
  );
  const onGoalHover = addGoalChartAndGetOnGoalHover(
    props,
    xAxisProps.xDomain,
    parent,
    charts,
  );
  addTrendlineChart(props, xAxisProps, yAxisProps, parent, charts);

  parent.compose(charts);

  if (groups.length > 1 && !props.isScalarSeries) {
    doGroupedBarStuff(parent);
  } else if (isHistogramBar(props)) {
    doHistogramBarStuff(parent);
  }

  // HACK: compositeChart + ordinal X axis shenanigans. See https://github.com/dc-js/dc.js/issues/678 and https://github.com/dc-js/dc.js/issues/662
  if (!isHistogram(props.settings)) {
    const hasBar = _.any(
      series,
      single => getSeriesDisplay(settings, single) === "bar",
    );
    parent._rangeBandPadding(hasBar ? BAR_PADDING_RATIO : 1);
  }

  applyXAxisSettings(parent, props.series, xAxisProps);

  applyYAxisSettings(parent, yAxisProps);

  setupTooltips(props, datas, parent, brushChangeFunctions);

  parent.render();

  // apply any on-rendering functions (this code lives in `LineAreaBarPostRenderer`)
  lineAndBarOnRender(parent, {
    onGoalHover,
    isSplitAxis: yAxisProps.isSplit,
    yAxisSplit: yAxisProps.yAxisSplit,
    xInterval: xAxisProps.xInterval,
    isStacked: isStacked(parent.settings, datas),
    formatYValue: getYValueFormatter(parent, series, yAxisProps.yExtent),
    datas,
  });

  // only ordinal axis can display "null" values
  if (isOrdinal(parent.settings)) {
    delete warnings[NULL_DIMENSION_WARNING];
  }

  if (onRender) {
    onRender({
      yAxisSplit: yAxisProps.yAxisSplit,
      // $FlowFixMe
      warnings: (Object.values(warnings): string[]),
    });
  }

  // return an unregister function
  return () => {
    dc.chartRegistry.deregister(parent);
  };
}

export const lineRenderer = (element, props) =>
  lineAreaBar(element, { ...props, chartType: "line" });
export const areaRenderer = (element, props) =>
  lineAreaBar(element, { ...props, chartType: "area" });
export const barRenderer = (element, props) =>
  lineAreaBar(element, { ...props, chartType: "bar" });
export const comboRenderer = (element, props) =>
  lineAreaBar(element, { ...props, chartType: "combo" });
export const scatterRenderer = (element, props) =>
  lineAreaBar(element, { ...props, chartType: "scatter" });
