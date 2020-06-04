/// functions for "applying" axes to charts, whatever that means.

import _ from "underscore";
import d3 from "d3";
import dc from "dc";
import moment from "moment";

import { datasetContainsNoResults } from "metabase/lib/dataset";
import { formatValue } from "metabase/lib/formatting";

import { computeTimeseriesTicksInterval } from "./timeseries";
import timeseriesScale from "./timeseriesScale";
import { isMultipleOf } from "./numeric";
import { getFriendlyName } from "./utils";
import { isHistogram } from "./renderer_utils";

// label offset (doesn't increase padding)
const X_LABEL_PADDING = 10;
const Y_LABEL_PADDING = 22;

/// d3.js is dumb and sometimes numTicks is a number like 10 and other times it is an Array like [10]
/// if it's an array then convert to a num. Use this function so you're guaranteed to get a number;
function getNumTicks(axis) {
  const ticks = axis.ticks();
  return Array.isArray(ticks) ? ticks[0] : ticks;
}

/// adjust the number of ticks to display on the y Axis based on its height in pixels. Since y axis ticks
/// are all the same height there's no need to do fancy measurement like we do below for the x axis.
export function adjustYAxisTicksIfNeeded(axis, axisHeightPixels) {
  const MIN_PIXELS_PER_TICK = 32;

  const numTicks = getNumTicks(axis);

  if (axisHeightPixels / numTicks < MIN_PIXELS_PER_TICK) {
    axis.ticks(Math.floor(axisHeightPixels / MIN_PIXELS_PER_TICK));
  }
}

/// Calculate the average length of values as strings.
///
///   averageStringLengthOfValues(["a", "toucan", "is", "wow"]); //-> 4
///
/// This is done so we can estimate how many ticks to show on the x axis, based on the average width of the tick
/// labels. To avoid wasting everyone's time measuring too many strings we only measure the first 100 which seems to
/// work well enough.
function averageStringLengthOfValues(values) {
  const MAX_VALUES_TO_MEASURE = 100;
  values = values.slice(0, MAX_VALUES_TO_MEASURE);

  let totalLength = 0;
  for (const value of values) {
    totalLength += String(value).length;
  }

  return Math.round(totalLength / values.length);
}

/// adjust the number of ticks displayed on the x axis based on the average width of each xValue. We measure the
/// xValues to determine an average length and then figure out how many will be able to fit based on the width of the
/// chart.
function adjustXAxisTicksIfNeeded(axis, chartWidthPixels, xValues) {
  // The const below is the number of pixels we should devote to each character for x-axis ticks. It can be thought
  // of as an average pixel width of a single character; this number is an approximation; adjust it to taste.
  // Higher values will reduce the number of ticks show on the x axis, increasing space between them; decreasing it
  // will increase tick density.
  const APPROXIMATE_AVERAGE_CHAR_WIDTH_PIXELS = 8;

  // calculate the average length of each tick, then convert that to pixels
  const tickAverageStringLength = averageStringLengthOfValues(xValues);
  const tickAverageWidthPixels =
    tickAverageStringLength * APPROXIMATE_AVERAGE_CHAR_WIDTH_PIXELS;

  // now figure out the approximate number of ticks we'll be able to show based on the width of the chart. Round
  // down so we error on the side of more space rather than less.
  const maxTicks = Math.floor(chartWidthPixels / tickAverageWidthPixels);

  // finally, if the chart is currently showing more ticks than we think it can show, adjust it down
  if (getNumTicks(axis) > maxTicks) {
    axis.ticks(maxTicks);
  }
}

export function applyChartTimeseriesXAxis(
  chart,
  series,
  { xValues, xDomain, xInterval },
) {
  // find the first nonempty single series
  // $FlowFixMe
  const firstSeries: SingleSeries = _.find(
    series,
    s => !datasetContainsNoResults(s.data),
  );

  // setup an x-axis where the dimension is a timeseries
  let dimensionColumn = firstSeries.data.cols[0];

  // compute the data interval
  const dataInterval = xInterval;
  let tickInterval = dataInterval;

  if (chart.settings["graph.x_axis.labels_enabled"]) {
    chart.xAxisLabel(
      chart.settings["graph.x_axis.title_text"] ||
        getFriendlyName(dimensionColumn),
      X_LABEL_PADDING,
    );
  }
  if (chart.settings["graph.x_axis.axis_enabled"]) {
    chart.renderVerticalGridLines(
      chart.settings["graph.x_axis.gridLine_enabled"],
    );

    if (dimensionColumn.unit == null) {
      dimensionColumn = { ...dimensionColumn, unit: dataInterval.interval };
    }

    // extract xInterval timezone for updating tickInterval
    const { timezone } = tickInterval;

    // special handling for weeks
    // TODO: are there any other cases where we should do this?
    let tickFormatUnit = dimensionColumn.unit;
    const tickFormat = timestamp => {
      const { column, ...columnSettings } = chart.settings.column(
        dimensionColumn,
      );
      return formatValue(timestamp, {
        ...columnSettings,
        column: { ...column, unit: tickFormatUnit },
        type: "axis",
        compact: chart.settings["graph.x_axis.axis_enabled"] === "compact",
      });
    };
    if (dataInterval.interval === "week") {
      // if tick interval is compressed then show months instead of weeks because they're nicer formatted
      const newTickInterval = computeTimeseriesTicksInterval(
        xDomain,
        tickInterval,
        chart.width(),
        tickFormat,
      );
      if (
        newTickInterval.interval !== tickInterval.interval ||
        newTickInterval.count !== tickInterval.count
      ) {
        tickFormatUnit = "month";
        tickInterval = { interval: "month", count: 1, timezone };
      }
    }

    chart.xAxis().tickFormat(tickFormat);

    // Compute a sane interval to display based on the data granularity, domain, and chart width
    tickInterval = {
      ...computeTimeseriesTicksInterval(
        xDomain,
        tickInterval,
        chart.width(),
        tickFormat,
      ),
      timezone,
    };
  }

  // pad the domain slightly to prevent clipping
  xDomain = stretchTimeseriesDomain(xDomain, dataInterval);

  // set the x scale
  chart.x(timeseriesScale(tickInterval).domain(xDomain));

  // set the x units (used to compute bar size)
  chart.xUnits((start, stop) =>
    Math.ceil(
      1 + moment(stop).diff(start, dataInterval.interval) / dataInterval.count,
    ),
  );
}

export function stretchTimeseriesDomain([start, end], { count, interval }) {
  // Non-timeseries axes are stretched by 0.75 x-intervals in both directions.
  // That's a bit trickier to do with dates because moment doesn't support
  // adding or subtracting partial months, weeks, or days. To work around this,
  // we do approximate math with smaller units. We're unable to add 0.75 months,
  // so instead we add 0.75 * 30 days. I'm unclear why, but moment *is* able to add partial years and quarters.
  if (interval === "month") {
    interval = "day";
    count *= 30;
  } else if (interval === "week") {
    interval = "day";
    count *= 7;
  } else if (interval === "day") {
    interval = "hour";
    count *= 24;
  }

  return [
    moment(start).subtract(count * 0.75, interval),
    moment(end).add(count * 0.75, interval),
  ];
}

export function applyChartQuantitativeXAxis(
  chart,
  series,
  { xValues, xDomain, xInterval },
) {
  // find the first nonempty single series
  // $FlowFixMe
  const firstSeries: SingleSeries = _.find(
    series,
    s => !datasetContainsNoResults(s.data),
  );
  const dimensionColumn = firstSeries.data.cols[0];

  if (chart.settings["graph.x_axis.labels_enabled"]) {
    chart.xAxisLabel(
      chart.settings["graph.x_axis.title_text"] ||
        getFriendlyName(dimensionColumn),
      X_LABEL_PADDING,
    );
  }
  if (chart.settings["graph.x_axis.axis_enabled"]) {
    chart.renderVerticalGridLines(
      chart.settings["graph.x_axis.gridLine_enabled"],
    );
    adjustXAxisTicksIfNeeded(chart.xAxis(), chart.width(), xValues);

    chart.xAxis().tickFormat(d => {
      // don't show ticks that aren't multiples of xInterval
      if (isMultipleOf(d, xInterval)) {
        return formatValue(d, {
          ...chart.settings.column(dimensionColumn),
          type: "axis",
          compact: chart.settings["graph.x_axis.axis_enabled"] === "compact",
        });
      }
    });
  } else {
    chart.xAxis().ticks(0);
    chart.xAxis().tickFormat("");
  }

  let scale;
  if (chart.settings["graph.x_axis.scale"] === "pow") {
    scale = d3.scale.pow().exponent(0.5);
  } else if (chart.settings["graph.x_axis.scale"] === "log") {
    scale = d3.scale.log().base(Math.E);
    if (
      !(
        (xDomain[0] < 0 && xDomain[1] < 0) ||
        (xDomain[0] > 0 && xDomain[1] > 0)
      )
    ) {
      throw "X-axis must not cross 0 when using log scale.";
    }
  } else {
    scale = d3.scale.linear();
  }

  // pad the domain slightly to prevent clipping
  xDomain = [xDomain[0] - xInterval * 0.75, xDomain[1] + xInterval * 0.75];

  chart.x(scale.domain(xDomain)).xUnits(dc.units.fp.precision(xInterval));
}

export function applyChartOrdinalXAxis(
  chart,
  series,
  { xValues, isHistogramBar },
) {
  // find the first nonempty single series
  // $FlowFixMe
  const firstSeries: SingleSeries = _.find(
    series,
    s => !datasetContainsNoResults(s.data),
  );

  const dimensionColumn = firstSeries.data.cols[0];

  if (chart.settings["graph.x_axis.labels_enabled"]) {
    chart.xAxisLabel(
      chart.settings["graph.x_axis.title_text"] ||
        getFriendlyName(dimensionColumn),
      X_LABEL_PADDING,
    );
  }
  if (chart.settings["graph.x_axis.axis_enabled"]) {
    chart.renderVerticalGridLines(
      chart.settings["graph.x_axis.gridLine_enabled"],
    );
    chart.xAxis().ticks(xValues.length);
    adjustXAxisTicksIfNeeded(chart.xAxis(), chart.width(), xValues);

    chart.xAxis().tickFormat(d =>
      formatValue(d, {
        ...chart.settings.column(dimensionColumn),
        type: "axis",
        compact: chart.settings["graph.x_axis.labels_enabled"] === "compact",
        noRange: isHistogramBar,
      }),
    );
  } else {
    chart.xAxis().ticks(0);
    chart.xAxis().tickFormat("");
  }

  if (isHistogram(chart.settings)) {
    // reduces x axis padding. see https://stackoverflow.com/a/44320663/113
    chart._outerRangeBandPadding(0);
  }

  chart.x(d3.scale.ordinal().domain(xValues)).xUnits(dc.units.ordinal);
}

// Sometimes tick marks are placed *just* off from zero.
// We still want to format these as "0" rather than "0.0000000000000018".
// But! We need to allow for real non-zero ticks at very small values,
// so we scale a tolerance to the extent of the yAxis.
// The tolerance is arbitrarily set to one millionth of the yExtent.
const TOLERANCE_TO_Y_EXTENT = 1e6;
export function maybeRoundValueToZero(value, [yMin, yMax]) {
  const tolerance = Math.abs(yMax - yMin) / TOLERANCE_TO_Y_EXTENT;
  return Math.abs(value) < tolerance ? 0 : value;
}

export function applyChartYAxis(chart, series, yExtent, axisName) {
  let axis;
  if (axisName !== "right") {
    axis = {
      scale: (...args) => chart.y(...args),
      axis: (...args) => chart.yAxis(...args),
      label: (...args) => chart.yAxisLabel(...args),
      setting: name => chart.settings["graph.y_axis." + name],
    };
  } else {
    axis = {
      scale: (...args) => chart.rightY(...args),
      axis: (...args) => chart.rightYAxis(...args),
      label: (...args) => chart.rightYAxisLabel(...args),
      setting: name => chart.settings["graph.y_axis." + name], // TODO: right axis settings
    };
  }

  if (axis.setting("labels_enabled")) {
    // left
    if (axis.setting("title_text")) {
      axis.label(axis.setting("title_text"), Y_LABEL_PADDING);
    } else {
      // only use the column name if all in the series are the same
      const labels = _.uniq(
        series.map(single => chart.settings.series(single).title),
      );
      if (labels.length === 1) {
        axis.label(labels[0], Y_LABEL_PADDING);
      }
    }
  }

  if (axis.setting("axis_enabled")) {
    axis.axis().tickFormat(getYValueFormatter(chart, series, yExtent));
    chart.renderHorizontalGridLines(true);
    adjustYAxisTicksIfNeeded(axis.axis(), chart.height());
  } else {
    axis.axis().ticks(0);
  }

  let scale;
  if (axis.setting("scale") === "pow") {
    scale = d3.scale.pow().exponent(0.5);
  } else if (axis.setting("scale") === "log") {
    scale = d3.scale.log().base(Math.E);
    // axis.axis().tickFormat((d) => scale.tickFormat(4,d3.format(",d"))(d));
  } else {
    scale = d3.scale.linear();
  }

  // This makes non-zero bar values take up at least one pixel.
  // Ideally, we would just pass a custom interpolate factory to `interpolate`.
  // However, dc.js passes its own after we give it the scael, so instead we
  // overwrite the scale's interpolate method. That let's us use theirs but
  // special case values withing one pixel of the edge.
  if (series.every(s => s.card.display === "bar")) {
    const _interpolate = scale.interpolate.bind(scale);
    scale.interpolate = customInterpolatorFactory =>
      _interpolate((a, b) => {
        // dc.js uses a rounding interpolator. We want to use the factory they
        // pass in, but we also need to create d3's default interpolator. We use
        // that to see when a value is between 0 and 1. If we just looked at the
        // rounded value, 0.49 would round to 0 and we wouldn't bump it up to 1.
        const custom = customInterpolatorFactory(a, b);
        const unrounded = d3.interpolate(a, b);
        return t => {
          const value = unrounded(t);
          const onePixelUp = custom(0) - 1;
          // y goes from top to bottom, so "onePixelUp" is actually the largest value
          if (onePixelUp < value && value < unrounded(0)) {
            return onePixelUp;
          }
          return custom(t);
        };
      });
  }

  scale.clamp(true);

  if (axis.setting("auto_range")) {
    // elasticY not compatible with log scale
    if (axis.setting("scale") !== "log") {
      // TODO: right axis?
      chart.elasticY(true);
    } else {
      const [min, max] = yExtent;
      if (!((min < 0 && max < 0) || (min > 0 && max > 0))) {
        throw "Y-axis must not cross 0 when using log scale.";
      }

      // With chart.elasticY, the y axis adjusts to show the beginning of the
      // bars. If there are any bar series, we try to do the same with the log
      // scale. We start at ±1 because things get wacky in (0, ±1].
      const noBarSeries = series.every(s => s.card.display !== "bar");
      if (noBarSeries) {
        scale.domain([min, max]);
      } else if (min < 0) {
        scale.domain([min, -1]);
      } else {
        scale.domain([1, max]);
      }
    }
    axis.scale(scale);
  } else {
    // We union data's yExtent with the range specified in the chart settings
    // This avoids rendering issues with bars and lines overflowing the c
    const [min, max] = d3.extent([
      axis.setting("min"),
      axis.setting("max"),
      ...yExtent,
    ]);
    if (
      axis.setting("scale") === "log" &&
      !((min < 0 && max < 0) || (min > 0 && max > 0))
    ) {
      throw "Y-axis must not cross 0 when using log scale.";
    }
    axis.scale(scale.domain([min, max]));
  }
}

export function getYValueFormatter(chart, series, yExtent) {
  // special case for normalized stacked charts
  // for normalized stacked charts the y-axis is a percentage number. In Javascript, 0.07 * 100.0 = 7.000000000000001 (try it) so we
  // round that number to get something nice like "7". Then we append "%" to get a nice tick like "7%"
  if (chart.settings["stackable.stack_type"] === "normalized") {
    return value => Math.round(value * 100) + "%";
  }
  const metricColumn = series[0].data.cols[1];
  const columnSettings = chart.settings.column(metricColumn);
  return (value, options) => {
    const roundedValue = maybeRoundValueToZero(value, yExtent);
    return formatValue(roundedValue, { ...columnSettings, ...options });
  };
}
