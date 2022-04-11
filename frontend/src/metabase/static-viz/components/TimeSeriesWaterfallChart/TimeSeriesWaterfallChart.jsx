import React from "react";
import PropTypes from "prop-types";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar } from "@visx/shape";
import { Group } from "@visx/group";
import {
  getLabelProps,
  getXTickLabelProps,
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
import { sortTimeSeries } from "../../lib/sort";
import { DATE_ACCESSORS } from "../../constants/accessors";

const propTypes = {
  data: PropTypes.array.isRequired,
  accessors: PropTypes.shape({
    x: PropTypes.func.isRequired,
    y: PropTypes.func.isRequired,
  }),
  settings: PropTypes.shape({
    x: PropTypes.object,
    y: PropTypes.object,
    colors: PropTypes.object,
    showTotal: PropTypes.bool,
  }),
  labels: PropTypes.shape({
    left: PropTypes.string,
    bottom: PropTypes.string,
  }),
};

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
  colors: {
    brand: "#509ee3",
    textLight: "#b8bbc3",
    textMedium: "#949aab",
    waterfallTotal: "#4C5773",
    waterfallPositive: "#88BF4D",
    waterfallNegative: "#EF8C8C",
  },
  numTicks: 4,
  barPadding: 0.2,
  labelFontWeight: 700,
  labelPadding: 12,
  strokeDasharray: "4",
};

const TimeSeriesWaterfallChart = ({
  data,
  accessors = DATE_ACCESSORS,
  settings,
  labels,
}) => {
  data = sortTimeSeries(data);
  const colors = settings?.colors;
  const yTickWidth = getYTickWidth(data, accessors, settings, layout.font.size);
  const yLabelOffset = yTickWidth + layout.labelPadding;
  const xMin = yLabelOffset + layout.font.size * 1.5;
  const xMax = layout.width - layout.margin.right - layout.margin.left;
  const yMax = layout.height - layout.margin.bottom;
  const innerWidth = xMax - xMin;
  const leftLabel = labels?.left;
  const bottomLabel = labels?.bottom;
  const palette = { ...layout.colors, ...colors };

  const entries = calculateWaterfallEntries(
    data,
    accessors,
    settings?.showTotal,
  );

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
    const fill = getWaterfallEntryColor(entry, palette);

    return { x, y, width, height, fill };
  };

  return (
    <svg width={layout.width} height={layout.height}>
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
        labelProps={getLabelProps(layout)}
        tickFormat={value => formatNumber(value, settings?.y)}
        tickLabelProps={() => getYTickLabelProps(layout)}
      />
      <AxisBottom
        scale={xScale}
        left={xMin}
        top={yMax + layout.margin.top}
        label={bottomLabel}
        numTicks={layout.numTicks}
        stroke={palette.textLight}
        tickStroke={palette.textLight}
        labelProps={getLabelProps(layout)}
        tickFormat={value => formatTimescaleWaterfallTick(value, settings)}
        tickLabelProps={() => getXTickLabelProps(layout)}
      />
    </svg>
  );
};

TimeSeriesWaterfallChart.propTypes = propTypes;

export default TimeSeriesWaterfallChart;
