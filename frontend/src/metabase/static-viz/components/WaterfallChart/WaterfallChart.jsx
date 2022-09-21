import React from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar } from "@visx/shape";
import { Group } from "@visx/group";
import { Text } from "@visx/text";
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
  formatTimescaleWaterfallTick,
  getWaterfallEntryColor,
} from "metabase/static-viz/lib/waterfall";
import { truncateText } from "metabase/static-viz/lib/text";
import { sortTimeSeries } from "../../lib/sort";
import {
  DATE_ACCESSORS,
  POSITIONAL_ACCESSORS,
} from "../../constants/accessors";
import { getWaterfallColors } from "../../lib/colors";

const layout = {
  width: 540,
  height: 300,
  margin: {
    top: 0,
    left: 55,
    right: 40,
    bottom: 40,
  },
  font: {
    size: 11,
    family: "Lato, sans-serif",
  },
  barPadding: 0.2,
  labelFontWeight: 700,
  labelPadding: 12,
  strokeDasharray: "4",
  numTicks: 4,
  maxTickWidth: 100,
};

// If inner chart area is smaller than this then it will look cramped
const MIN_INNER_HEIGHT = 250;

const MAX_EXTRA_HEIGHT = 40;

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
      ? 0
      : getXTickWidth(data, accessors, layout.maxTickWidth, layout.font.size);

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
            layout.font.size,
          );
          const transform = isVertical
            ? `rotate(-90, ${x} ${y}) translate(${Math.floor(
                layout.font.size / 2,
              )} ${Math.floor(layout.font.size / 3)})`
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
  // Below this the code is the same
  const tickLabelProps = getXTickLabelProps(layout, isVertical, getColor);

  const xTickHeight = xTickWidth;
  const yTickWidth = getYTickWidth(data, accessors, settings, layout.font.size);
  const yLabelOffset = yTickWidth + layout.labelPadding;
  const xMin = yLabelOffset + layout.font.size * 1.5;
  const xMax = layout.width - layout.margin.right - layout.margin.left;
  const xAxisHeight = getXAxisHeight(isVertical, xTickHeight);
  let yMax = layout.height - xAxisHeight - layout.margin.top;
  let height = layout.height;
  // If inner chart area is too short try to expand it but not more than MAX_EXTRA_HEIGHT
  // to match what we do with XYChart (XYChart with legends can have be up to 340px tall)
  if (yMax < MIN_INNER_HEIGHT) {
    height = minMax(
      layout.height,
      layout.height + MAX_EXTRA_HEIGHT,
      yMax + xAxisHeight + MAX_EXTRA_HEIGHT,
    );
    yMax = height - xAxisHeight;
  }
  const innerWidth = xMax - xMin;
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

  return (
    <svg width={layout.width} height={height}>
      <Group top={layout.margin.top} left={xMin}>
        <GridRows
          scale={yScale}
          width={innerWidth}
          strokeDasharray={layout.strokeDasharray}
        />
        {entries.map((entry, index) => (
          <Bar key={index} {...getBarProps(entry)} />
        ))}
      </Group>
      <AxisLeft
        scale={yScale}
        top={layout.margin.top}
        left={xMin}
        label={leftLabel}
        labelOffset={yLabelOffset}
        hideTicks
        hideAxisLine
        labelProps={getLabelProps(layout, getColor)}
        tickFormat={value => formatNumber(value, settings?.y)}
        tickLabelProps={() => getYTickLabelProps(layout, getColor)}
      />
      <AxisBottom
        scale={xScale}
        left={xMin}
        top={yMax + layout.margin.top}
        label={labels?.bottom}
        numTicks={numTicks}
        stroke={getColor("text-light")}
        tickStroke={getColor("text-light")}
        labelProps={getLabelProps(layout, getColor)}
        tickComponent={props => <Text {...getXTickProps(props)} />}
        tickLabelProps={() => tickLabelProps}
      />
    </svg>
  );
}

/**
 *
 * @param {'timeseries'|'categorical'} type
 * @returns {typeof POSITIONAL_ACCESSORS | undefined}
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
 * @param {boolean} isVertical
 * @param {number} xTickHeight
 * @returns {number} The height of the X-axis section of the chart
 */
function getXAxisHeight(isVertical, xTickHeight) {
  if (isVertical) {
    console.log({
      xTickHeight,
      padding: layout.labelPadding,
      fontSize: layout.font.size,
    });
    return xTickHeight + layout.labelPadding + layout.font.size;
  }

  return layout.margin.bottom;
}

/**
 *
 * @param {number} min
 * @param {number} max
 * @param {number} value
 */
function minMax(min, max, value) {
  const minmax = Math.min(max, Math.max(min, value));
  console.log({ min, max, value, minmax });
  return minmax;
}

export default WaterfallChart;
