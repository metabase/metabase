import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar } from "@visx/shape";
import { Group } from "@visx/group";
import { Text } from "@visx/text";
import { assoc, merge } from "icepick";
import {
  getLabelProps,
  getXTickLabelProps,
  getXTickWidth,
  getYTickLabelProps,
  getYTickWidth,
} from "metabase/static-viz/lib/axes";
import { formatNumber } from "metabase/static-viz/lib/numbers";
import {
  calculateWaterfallDomain,
  calculateWaterfallEntries,
  calculateWaterfallSeriesForValues,
  formatTimescaleWaterfallTick,
  getWaterfallEntryColor,
} from "metabase/static-viz/lib/waterfall";
import { measureTextHeight, truncateText } from "metabase/static-viz/lib/text";
import { sortTimeSeries } from "../../lib/sort";
import {
  DATE_ACCESSORS,
  POSITIONAL_ACCESSORS,
} from "../../constants/accessors";
import { getWaterfallColors } from "../../lib/colors";
import Values from "../Values";
import { createXScale } from "../XYChart/utils";

const layout = {
  width: 540,
  height: 300,
  margin: {
    // Add some margin so when the chart scale down,
    // elements that are rendered at the top of the chart doesn't get cut off
    top: 12,
    left: 55,
    right: 40,
  },
  barPadding: 0.2,
  labelPadding: 12,
  strokeDasharray: "4",
  numTicks: 4,
  maxTickWidth: 100,
};

// If inner chart area is smaller than this then it will look cramped
const MIN_INNER_HEIGHT = 250;
const MAX_EXTRA_HEIGHT = 40;
// The default value for tick length
const TICK_LENGTH = 8;
const VALUES_MARGIN = 6;

// Since we're using JSDoc instead, which provide more static type checking than PropTypes.
/* eslint-disable react/prop-types */
/**
 *
 * @param {import("./types").WaterfallChartProps} props
 * @returns {JSX.Element}
 */
function WaterfallChart({
  data,
  type,
  accessors = getDefaultAccessors(type),
  settings,
  labels,
  getColor,
}) {
  const chartStyle = {
    fontFamily: "Lato, sans-serif",
    axes: {
      color: getColor("text-light"),
      ticks: {
        color: getColor("text-medium"),
        fontSize: 12,
      },
      labels: {
        color: getColor("text-medium"),
        fontSize: 14,
        fontWeight: 700,
      },
    },
    value: {
      color: getColor("text-dark"),
      fontSize: 12,
      fontWeight: 800,
      stroke: getColor("white"),
      strokeWidth: 3,
    },
  };

  const axesProps = {
    stroke: chartStyle.axes.color,
    tickStroke: chartStyle.axes.color,
  };

  const valueProps = {
    fontSize: chartStyle.value?.fontSize,
    fontFamily: chartStyle.fontFamily,
    fontWeight: chartStyle.value?.fontWeight,
    letterSpacing: 0.5,
    fill: chartStyle.value?.color,
    stroke: chartStyle.value?.stroke,
    strokeWidth: chartStyle.value?.strokeWidth,
  };

  if (type === "timeseries") {
    data = sortTimeSeries(data);
  }
  const entries = calculateWaterfallEntries(
    data,
    accessors,
    settings?.showTotal,
  );

  const isVertical = type === "timeseries" ? false : entries.length > 10;
  const xTickWidth =
    type === "timeseries"
      ? // We don't know the width of the time-series label because it's formatted inside `<AxisBottom />`.
        // We could extract those logic out, but it's gonna be nasty, and we didn't need `xTickWidth` for time-series anyway.
        0
      : getXTickWidth(
          data,
          accessors,
          layout.maxTickWidth,
          chartStyle.axes.ticks.fontSize,
        );

  const getXTickProps =
    type === "timeseries"
      ? ({ formattedValue, ...props }) => {
          return {
            ...props,
            children: formatTimescaleWaterfallTick(formattedValue, settings),
          };
        }
      : ({ x, y, formattedValue, ...props }) => {
          const textWidth = isVertical ? xTickWidth : xScale.bandwidth();
          const truncatedText = truncateText(
            formattedValue,
            textWidth,
            chartStyle.axes.ticks.fontSize,
          );
          const xTickFontSize = chartStyle.axes.ticks.fontSize;
          const transform = isVertical
            ? `rotate(-90, ${x} ${y}) translate(${Math.floor(
                xTickFontSize * 0.9,
              )} ${Math.floor(xTickFontSize / 3)})`
            : undefined;

          const textAnchor = isVertical ? "end" : "middle";

          return {
            ...props,
            x,
            y,
            transform,
            children: truncatedText,
            textAnchor,
          };
        };

  const numTicks = type === "timeseries" ? layout.numTicks : entries.length;
  const tickLabelProps = getXTickLabelProps(chartStyle, isVertical);
  const topMargin = settings.show_values
    ? layout.margin.top + VALUES_MARGIN
    : layout.margin.top;

  const xTickHeight = isVertical ? xTickWidth : chartStyle.axes.ticks.fontSize;
  const yTickWidth = getYTickWidth(
    data,
    accessors,
    settings,
    chartStyle.axes.ticks.fontSize,
  );
  const yLabelOffset = yTickWidth + layout.labelPadding;
  const xMin = yLabelOffset + chartStyle.axes.labels.fontSize * 1.5;
  const xMax = layout.width - layout.margin.right - layout.margin.left;
  const xAxisHeight = getXAxisHeight(
    xTickHeight,
    measureTextHeight(chartStyle.axes.labels.fontSize),
  );
  let yMax = layout.height - xAxisHeight - topMargin;
  let height = layout.height;
  // If inner chart area is too short, try to expand it but not more than `MAX_EXTRA_HEIGHT`
  // to match what we do with XYChart (with legends, it can be up to 340px tall)
  if (yMax < MIN_INNER_HEIGHT) {
    yMax =
      minMax(
        layout.height,
        layout.height + MAX_EXTRA_HEIGHT,
        yMax + xAxisHeight + MAX_EXTRA_HEIGHT,
      ) - xAxisHeight;
    height = topMargin + yMax + xAxisHeight;
  }
  const leftLabel = labels?.left;

  const xScale = scaleBand({
    domain: entries.map(entry => entry.x),
    range: [0, xMax],
    padding: layout.barPadding,
  });

  const yScale = scaleLinear({
    domain: calculateWaterfallDomain(entries),
    range: [yMax, 0],
  });

  const getBarProps = entry => {
    const width = xScale.bandwidth();

    const height = Math.abs(yScale(entry.start) - yScale(entry.end));
    const x = xScale(entry.x);
    const y = yScale(Math.max(entry.start, entry.end));

    const fill = getWaterfallEntryColor(
      entry,
      getWaterfallColors(settings?.colors, getColor),
    );

    return { x, y, width, height, fill };
  };

  // Used only for rendering data point values
  const series = calculateWaterfallSeriesForValues(
    data,
    accessors,
    settings?.showTotal,
  );

  return (
    <svg width={layout.width} height={height}>
      <Group top={topMargin} left={xMin}>
        <GridRows
          scale={yScale}
          width={xMax}
          strokeDasharray={layout.strokeDasharray}
        />
      </Group>

      <AxisLeft
        scale={yScale}
        top={topMargin}
        left={xMin}
        label={leftLabel}
        labelOffset={yLabelOffset}
        hideTicks
        hideAxisLine
        labelProps={getLabelProps(chartStyle)}
        tickFormat={value => formatNumber(value, settings?.y)}
        tickLabelProps={() => getYTickLabelProps(chartStyle)}
        {...axesProps}
      />
      <AxisBottom
        scale={xScale}
        left={xMin}
        top={yMax + topMargin}
        label={labels?.bottom}
        tickLength={TICK_LENGTH}
        numTicks={numTicks}
        labelProps={merge(getLabelProps(chartStyle, getColor), {
          dy:
            -measureTextHeight(chartStyle.axes.labels.fontSize) +
            xTickHeight +
            layout.labelPadding,
        })}
        tickComponent={props => <Text {...getXTickProps(props)} />}
        tickLabelProps={() => tickLabelProps}
        {...axesProps}
      />
      <Group top={topMargin} left={xMin}>
        {entries.map((entry, index) => (
          <Bar key={index} {...getBarProps(entry)} />
        ))}
        {settings.show_values && (
          <Values
            series={series}
            formatter={(value, compact) =>
              formatNumber(value, maybeAssoc(settings.y, "compact", compact))
            }
            valueProps={valueProps}
            xScale={createXScale(series, [0, xMax], "ordinal")}
            yScaleLeft={yScale}
            yScaleRight={null}
            innerWidth={xMax}
            xAxisYPos={yMax}
            settings={settings}
          />
        )}
      </Group>
    </svg>
  );
}

/**
 *
 * @param {'timeseries'|'categorical'} type
 * @returns {typeof POSITIONAL_ACCESSORS}
 */
function getDefaultAccessors(type) {
  if (type === "timeseries") {
    return DATE_ACCESSORS;
  }

  if (type === "categorical") {
    return POSITIONAL_ACCESSORS;
  }
}

/**
 *
 * @param {number} xTickHeight
 * @param {number} xLabelHeight
 * @returns {number} The height of the X-axis section of the chart
 */
function getXAxisHeight(xTickHeight, xLabelHeight) {
  // x-axis height = tick length (dash) + tick label height + label padding + label height
  return TICK_LENGTH + xTickHeight + layout.labelPadding + xLabelHeight;
}

/**
 *
 * @param {number} min
 * @param {number} max
 * @param {number} value
 */
function minMax(min, max, value) {
  return Math.min(max, Math.max(min, value));
}

const maybeAssoc = (collection, key, value) => {
  if (collection == null) {
    return collection;
  }

  return assoc(collection, key, value);
};

export default WaterfallChart;
