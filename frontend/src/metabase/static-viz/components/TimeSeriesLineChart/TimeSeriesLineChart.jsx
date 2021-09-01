import React from "react";
import PropTypes from "prop-types";
import { scaleLinear, scaleTime } from "@visx/scale";
import { GridRows } from "@visx/grid";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { LinePath } from "@visx/shape";

const propTypes = {
  data: PropTypes.array.isRequired,
  accessors: PropTypes.shape({
    x: PropTypes.func,
    y: PropTypes.func,
  }).isRequired,
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
};

const TimeSeriesLineChart = ({ data, accessors, labels }) => {
  const xMax = layout.width - layout.margin.right;
  const yMax = layout.height - layout.margin.bottom;
  const innerWidth = xMax - layout.margin.left;
  const leftLabel = labels?.left;
  const bottomLabel = labels?.bottom;

  const xScale = scaleTime({
    domain: [
      Math.min(...data.map(accessors.x)),
      Math.max(...data.map(accessors.x)),
    ],
    range: [layout.margin.left, xMax],
  });

  const yScale = scaleLinear({
    domain: [0, Math.max(...data.map(accessors.y))],
    range: [yMax, 0],
    nice: true,
  });

  const getLeftTickLabelProps = () => ({
    fontSize: layout.font.size,
    fontFamily: layout.font.family,
    fill: layout.colors.textMedium,
    textAnchor: "end",
  });

  const getBottomTickLabelProps = () => ({
    fontSize: layout.font.size,
    fontFamily: layout.font.family,
    fill: layout.colors.textMedium,
    textAnchor: "middle",
  });

  return (
    <svg width={layout.width} height={layout.height}>
      <GridRows
        scale={yScale}
        left={layout.margin.left}
        width={innerWidth}
        strokeDasharray="4"
      />
      <LinePath
        data={data}
        stroke={layout.colors.brand}
        strokeWidth={2}
        x={d => xScale(accessors.x(d))}
        y={d => yScale(accessors.y(d))}
      />
      <AxisLeft
        scale={yScale}
        left={layout.margin.left}
        label={leftLabel}
        hideTicks
        hideAxisLine
        tickLabelProps={() => getLeftTickLabelProps()}
      />
      <AxisBottom
        scale={xScale}
        top={yMax}
        label={bottomLabel}
        numTicks={5}
        stroke={layout.colors.textLight}
        tickStroke={layout.colors.textLight}
        tickFormat={d => new Date(d).toLocaleDateString()}
        tickLabelProps={() => getBottomTickLabelProps()}
      />
    </svg>
  );
};

TimeSeriesLineChart.propTypes = propTypes;

export default TimeSeriesLineChart;
