import React from "react";
import PropTypes from "prop-types";
import { scaleLinear, scaleBand } from "@visx/scale";
import { GridRows } from "@visx/grid";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { LinePath } from "@visx/shape";
import {
  getXTickLabelProps,
  getYTickWidth,
  getYTickLabelProps,
  getLabelProps,
} from "../../lib/axes";
import { formatDate } from "../../lib/dates";
import { formatNumber } from "../../lib/numbers";
import { sortTimeSeries } from "../../lib/sort";
import { DATE_ACCESSORS } from "../../constants/accessors";

const propTypes = {
  data: PropTypes.array.isRequired,
  accessors: PropTypes.shape({
    x: PropTypes.func,
    y: PropTypes.func,
  }),
  settings: PropTypes.shape({
    x: PropTypes.object,
    y: PropTypes.object,
    colors: PropTypes.object,
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
  },
  numTicks: 5,
  labelFontWeight: 700,
  labelPadding: 12,
  strokeWidth: 2,
  strokeDasharray: "4",
};

const TimeSeriesLineChart = ({
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
  const xMax = layout.width - layout.margin.right;
  const yMax = layout.height - layout.margin.bottom;
  const innerWidth = xMax - xMin;
  const leftLabel = labels?.left;
  const bottomLabel = labels?.bottom;
  const palette = { ...layout.colors, ...colors };

  const xScale = scaleBand({
    domain: data.map(accessors.x),
    range: [xMin, xMax],
    round: true,
  });

  const yScale = scaleLinear({
    domain: [0, Math.max(...data.map(accessors.y))],
    range: [yMax, 0],
    nice: true,
  });

  return (
    <svg width={layout.width} height={layout.height}>
      <GridRows
        scale={yScale}
        left={xMin}
        width={innerWidth}
        strokeDasharray={layout.strokeDasharray}
      />
      <LinePath
        data={data}
        stroke={palette.brand}
        strokeWidth={layout.strokeWidth}
        x={d => xScale(accessors.x(d)) + xScale.bandwidth() / 2}
        y={d => yScale(accessors.y(d))}
      />
      <AxisLeft
        scale={yScale}
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
        top={yMax}
        label={bottomLabel}
        numTicks={layout.numTicks}
        stroke={palette.textLight}
        tickStroke={palette.textLight}
        labelProps={getLabelProps(layout)}
        tickFormat={value => formatDate(value, settings?.x)}
        tickLabelProps={() => getXTickLabelProps(layout)}
      />
    </svg>
  );
};

TimeSeriesLineChart.propTypes = propTypes;

export default TimeSeriesLineChart;
