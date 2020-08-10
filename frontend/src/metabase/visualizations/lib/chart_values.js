import _ from "underscore";

import { COMPACT_CURRENCY_OPTIONS } from "metabase/lib/formatting";
import { moveToFront } from "metabase/lib/dom";
import { isHistogramBar } from "./renderer_utils";

/*
There's a lot of messy logic in this function. Its purpose is to place text labels at the appropriate place over a chart.
To do this it has to match the behavior in dc.js and our own hacks on top of that. Here are some things it does:
 - Show labels under (rather than over) local minima on line charts.
 - Hide labels to only show every nth label if there isn't enough horizontal space.
 - Rotate labels for tightly spaced grouped bar chart.
 - Switch label formatting to compact if it will save space.
 - Drop clustered labels for overlapping lines and bars.
*/

export function onRenderValueLabels(
  chart,
  { formatYValue, xInterval, yAxisSplit, datas },
) {
  const seriesSettings = datas.map((_, seriesIndex) =>
    chart.settings.series(chart.series[seriesIndex]),
  );

  // See if each series is enabled. Fall back to the chart-level setting if undefined.
  let showSeries = seriesSettings.map(
    ({ show_series_values = chart.settings["graph.show_values"] }) =>
      show_series_values,
  );

  if (
    showSeries.every(s => s === false) || // every series setting is off
    chart.settings["stackable.stack_type"] === "normalized" // chart is normalized
  ) {
    return;
  }

  let displays = seriesSettings.map(settings => settings.display);
  if (chart.settings["stackable.stack_type"] === "stacked") {
    // When stacked, flatten datas into one series. We'll sum values on the same x point later.
    datas = [datas.flat()];

    // Individual series might have display set to something besides the actual stacked display.
    displays = [chart.settings["stackable.stack_display"]];
    showSeries = [true];
  }
  const showAll = chart.settings["graph.label_value_frequency"] === "all";

  let barWidth;
  const barCount = displays.filter(d => d === "bar").length;
  if (barCount > 0) {
    barWidth = parseFloat(
      chart
        .svg()
        .select("rect.bar")[0][0]
        .getAttribute("width"),
    );
  }

  const xScale = chart.x();
  const yScaleForSeries = index =>
    yAxisSplit[0].includes(index) ? chart.y() : chart.rightY();

  // Update datas to use named x/y and include `showLabelBelow`.
  // We need to add `showLabelBelow` before data is filtered to show every nth value.
  datas = datas.map((data, seriesIndex) => {
    if (!showSeries[seriesIndex]) {
      // We need to keep the series in `datas` to place the labels correctly over grouped bar charts.
      // Instead, we remove all the data so no labels are displayed.
      return [];
    }
    const display = displays[seriesIndex];

    // Sum duplicate x values in the same series.
    data = _.chain(data)
      .groupBy(([x]) => xScale(x))
      .values()
      .map(data => {
        const [[x]] = data;
        const y = data.reduce((sum, [, y]) => sum + y, 0);
        return [x, y];
      })
      .value();

    return data
      .map(([x, y], i) => {
        const isLocalMin =
          // first point or prior is greater than y
          (i === 0 || data[i - 1][1] > y) &&
          // last point point or next is greater than y
          (i === data.length - 1 || data[i + 1][1] > y);
        const showLabelBelow = isLocalMin && display === "line";
        const rotated = barCount > 1 && display === "bar" && barWidth < 40;
        const hidden =
          !showAll && barCount > 1 && display === "bar" && barWidth < 20;
        return { x, y, showLabelBelow, seriesIndex, rotated, hidden };
      })
      .filter(d => !(display === "bar" && d.y === 0));
  });

  // Count max points in a single series to estimate when labels should be hidden
  const maxSeriesLength = Math.max(...datas.map(d => d.length));

  const formattingSetting = chart.settings["graph.label_value_formatting"];
  const compactForSeries = datas.map(data => {
    if (formattingSetting === "compact") {
      return true;
    }
    if (formattingSetting === "full") {
      return false;
    }
    // for "auto" we use compact if it shortens avg label length by >3 chars
    const getAvgLength = compact => {
      const options = {
        compact,
        // We include compact currency options here for both compact and
        // non-compact formatting. This prevents auto's logic from depending on
        // those settings.
        ...COMPACT_CURRENCY_OPTIONS,
        // We need this to ensure the settings are used. Otherwise, a cached
        // _numberFormatter would take precedence.
        _numberFormatter: undefined,
      };
      const lengths = data.map(d => formatYValue(d.y, options).length);
      return lengths.reduce((sum, l) => sum + l, 0) / lengths.length;
    };
    return getAvgLength(true) < getAvgLength(false) - 3;
  });

  // use the chart body so things line up properly
  const parent = chart.svg().select(".chart-body");

  // Ordinal bar charts and histograms need extra logic to center the label.
  const xShifts = displays.map((display, index) => {
    if (display !== "bar") {
      return 0;
    }
    const barIndex = displays.slice(0, index).filter(d => d === "bar").length;
    let xShift = 0;

    if (xScale.rangeBand) {
      if (display === "bar") {
        const xShiftForSeries = xScale.rangeBand() / barCount;
        xShift += (barIndex + 0.5) * xShiftForSeries;
      } else {
        xShift += xScale.rangeBand() / 2;
      }
      if (displays.some(d => d === "bar") && displays.some(d => d !== "bar")) {
        xShift += (chart._rangeBandPadding() * xScale.rangeBand()) / 2;
      }
    } else if (
      // non-ordinal bar charts don't have rangeBand set, but still need xShifting if they're grouped.
      barWidth
    ) {
      // This mirrors the behavior of `doGroupedBarStuff`
      const seriesPadding = barWidth < 4 ? 0 : barWidth < 8 ? 1 : 2;
      const groupWidth = (barWidth + seriesPadding) * barCount;

      xShift -= groupWidth / 2;
      const xShiftForSeries = groupWidth / barCount;
      xShift += (barIndex + 0.5) * xShiftForSeries;
    }

    if (
      isHistogramBar({ settings: chart.settings, chartType: display }) &&
      displays.length === 1
    ) {
      // this has to match the logic in `doHistogramBarStuff`
      const [x1, x2] = chart
        .svg()
        .selectAll("rect")
        .flat()
        .map(r => parseFloat(r.getAttribute("x")));
      const barWidth = x2 - x1;
      xShift += barWidth / 2;
    }
    return xShift;
  });

  const xyPos = ({ x, y, showLabelBelow, seriesIndex }) => {
    const yScale = yScaleForSeries(seriesIndex);
    const xPos = xShifts[seriesIndex] + xScale(x);
    let yPos = yScale(y) + (showLabelBelow ? 18 : -8);
    // if the yPos is below the x axis, move it to be above the data point
    const [yMax] = yScale.range();
    if (yPos > yMax) {
      yPos = yScale(y) - 8;
    }
    return {
      xPos,
      yPos,
      // yHeight is the distance from the x axis
      yHeight: yMax - yPos,
    };
  };

  const MIN_ROTATED_HEIGHT = 50;
  const addLabels = (data, compact = null) => {
    // make sure we don't add .value-lables multiple times
    parent.select(".value-labels").remove();

    data = data
      .map(d => ({ ...d, ...xyPos(d) }))
      // remove rotated labels when the bar is too short
      .filter(d => !(d.rotated && d.yHeight < MIN_ROTATED_HEIGHT));

    const labelGroups = parent
      .append("svg:g")
      .classed("value-labels", true)
      .selectAll("g")
      .data(data)
      .enter()
      .append("g")
      .attr("text-anchor", d => (d.rotated ? "end" : "middle"))
      .attr("transform", d => {
        const transforms = [`translate(${d.xPos}, ${d.yPos})`];
        if (d.rotated) {
          transforms.push("rotate(-90)", `translate(-15, 4)`);
        }
        return transforms.join(" ");
      });

    // Labels are either white inside the bar or black with white outline.
    // For outlined labels, Safari had an issue with rendering paint-order: stroke.
    // To work around that, we create two text labels: one for the the black text
    // and another for the white outline behind it.
    ["value-label-outline", "value-label", "value-label-white"].forEach(klass =>
      labelGroups
        .append("text")
        // only create labels for the correct class(es) given the type of label
        .filter(d => !(d.rotated ^ (klass === "value-label-white")))
        .attr("class", klass)
        .text(({ y, seriesIndex }) =>
          formatYValue(y, {
            compact: compact === null ? compactForSeries[seriesIndex] : compact,
          }),
        ),
    );
  };

  const nthForSeries = datas.map((data, index) => {
    if (showAll || (barCount > 1 && displays[index] === "bar")) {
      // show all is turned on or this is a bar in a grouped bar chart
      return 1;
    }
    // auto fit
    // Render a sample of rows to estimate average label size.
    // We use that estimate to compute the label interval.
    const LABEL_PADDING = 6;
    const MAX_SAMPLE_SIZE = 30;
    const sampleStep = Math.ceil(maxSeriesLength / MAX_SAMPLE_SIZE);
    const sample = data.filter((d, i) => i % sampleStep === 0);
    addLabels(sample, compactForSeries[index]);
    const totalWidth = chart
      .svg()
      .selectAll(".value-label-outline")
      .flat()
      .reduce((sum, label) => sum + label.getBoundingClientRect().width, 0);
    const labelWidth = totalWidth / sample.length + LABEL_PADDING;

    const { width: chartWidth } = chart
      .svg()
      .select(".axis.x")
      .node()
      .getBoundingClientRect();

    return Math.ceil((labelWidth * maxSeriesLength) / chartWidth);
  });

  // Hide labels when lines are clustered together.
  // We group data points by x value, sort by y, and walk across them.
  // If the label is too close to the previous one, we try flipping it to the other side.
  // If that failed, we hide the label.
  const MIN_SPACING = 20;
  _.chain(datas)
    .flatten()
    .filter(
      d =>
        displays[d.seriesIndex] === "line" || displays[d.seriesIndex] === "bar",
    )
    .map(d => ({ d, ...xyPos(d) }))
    .groupBy(({ xPos }) => xPos)
    .values()
    .each(group => {
      const sortedByY = _.sortBy(group, ({ yPos }) => yPos);
      let prev;
      for (const { d, yPos } of sortedByY) {
        if (prev == null || yPos - prev > MIN_SPACING) {
          // there's enough space between this label and the prev
          prev = yPos;
          continue;
        }

        if (!d.showLabelBelow && displays[d.seriesIndex] === "line") {
          // if we're a line label that's currently above the line
          // try flipping the label below to get farther from previous label
          const flippedYPos = xyPos({ ...d, showLabelBelow: true }).yPos;
          if (flippedYPos - prev > MIN_SPACING) {
            d.showLabelBelow = true;
            prev = flippedYPos;
            continue;
          }
        }

        // hide this label and don't update prev so it isn't considered for collisions
        d.hidden = true;
      }
    });

  addLabels(
    datas.flatMap(data =>
      data.filter((d, i) => i % nthForSeries[d.seriesIndex] === 0 && !d.hidden),
    ),
  );

  moveToFront(
    chart
      .svg()
      .select(".value-labels")
      .node().parentNode,
  );
}
