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
import { getWaterfallColors } from "../../lib/colors";

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
  getColor: PropTypes.func,
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
  getColor,
}) => {
  data = sortTimeSeries(data);
  const yTickWidth = getYTickWidth(data, accessors, settings, layout.font.size);
  const yLabelOffset = yTickWidth + layout.labelPadding;
  const xMin = yLabelOffset + layout.font.size * 1.5;
  const xMax = layout.width - layout.margin.right - layout.margin.left;
  const yMax = layout.height - layout.margin.bottom;
  const innerWidth = xMax - xMin;
  const leftLabel = labels?.left;
  const bottomLabel = labels?.bottom;

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
    const fill = getWaterfallEntryColor(
      entry,
      getWaterfallColors(settings?.colors, getColor),
    );

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
        labelProps={getLabelProps(layout, getColor)}
        tickFormat={value => formatNumber(value, settings?.y)}
        tickLabelProps={() => getYTickLabelProps(layout, getColor)}
      />
      <AxisBottom
        scale={xScale}
        left={xMin}
        top={yMax + layout.margin.top}
        label={bottomLabel}
        numTicks={layout.numTicks}
        stroke={getColor("text-light")}
        tickStroke={getColor("text-light")}
        labelProps={getLabelProps(layout, getColor)}
        tickFormat={value => formatTimescaleWaterfallTick(value, settings)}
        tickLabelProps={() => getXTickLabelProps(layout, false, getColor)}
      />
    </svg>
  );
};

TimeSeriesWaterfallChart.propTypes = propTypes;

export default TimeSeriesWaterfallChart;
