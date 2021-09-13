import React from "react";
import PropTypes from "prop-types";
import { scaleLinear, scaleTime } from "@visx/scale";
import { GridRows } from "@visx/grid";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { LinePath } from "@visx/shape";
import {
  getXTickLabelProps,
  getYAxisWidth,
  getYTickLabelProps,
} from "../../lib/axes";
import { formatDate } from "../../lib/dates";
import { formatNumber } from "../../lib/numbers";

const propTypes = {
  data: PropTypes.array.isRequired,
  accessors: PropTypes.shape({
    x: PropTypes.func,
    y: PropTypes.func,
  }).isRequired,
  settings: PropTypes.shape({
    x: PropTypes.object,
    y: PropTypes.object,
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
  labelPadding: 8,
  strokeWidth: 2,
  strokeDasharray: "4",
};

const TimeSeriesLineChart = ({ data, accessors, settings, labels }) => {
  const yAxisWidth = getYAxisWidth(data, accessors, settings);
  const yLabelOffset = yAxisWidth + layout.labelPadding;
  const xMin = yLabelOffset + layout.font.size * 1.5;
  const xMax = layout.width - layout.margin.right;
  const yMax = layout.height - layout.margin.bottom;
  const innerWidth = xMax - xMin;
  const leftLabel = labels?.left;
  const bottomLabel = labels?.bottom;

  const xScale = scaleTime({
    domain: [
      Math.min(...data.map(accessors.x)),
      Math.max(...data.map(accessors.x)),
    ],
    range: [xMin, xMax],
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
        stroke={layout.colors.brand}
        strokeWidth={layout.strokeWidth}
        x={d => xScale(accessors.x(d))}
        y={d => yScale(accessors.y(d))}
      />
      <AxisLeft
        scale={yScale}
        left={xMin}
        label={leftLabel}
        labelOffset={yLabelOffset}
        hideTicks
        hideAxisLine
        tickFormat={value => formatNumber(value, settings?.y)}
        tickLabelProps={() => getYTickLabelProps(layout)}
      />
      <AxisBottom
        scale={xScale}
        top={yMax}
        label={bottomLabel}
        numTicks={layout.numTicks}
        stroke={layout.colors.textLight}
        tickStroke={layout.colors.textLight}
        tickFormat={value => formatDate(value, settings?.x)}
        tickLabelProps={() => getXTickLabelProps(layout)}
      />
    </svg>
  );
};

TimeSeriesLineChart.propTypes = propTypes;

export default TimeSeriesLineChart;
