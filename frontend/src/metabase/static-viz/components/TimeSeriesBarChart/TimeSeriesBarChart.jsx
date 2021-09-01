import React from "react";
import PropTypes from "prop-types";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar } from "@visx/shape";

const propTypes = {
  data: PropTypes.array.isRequired,
  accessors: PropTypes.shape({
    x: PropTypes.func.isRequired,
    y: PropTypes.func.isRequired,
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
    bar: "#509ee3",
    stroke: "#b8bbc3",
    label: "#949aab",
  },
};

const TimeSeriesBarChart = ({ data, accessors, labels }) => {
  const xMax = layout.width - layout.margin.right;
  const yMax = layout.height - layout.margin.bottom;
  const innerWidth = xMax - layout.margin.left;
  const innerHeight = yMax - layout.margin.top;
  const leftLabel = labels?.left;
  const bottomLabel = labels?.bottom;

  const xScale = scaleBand({
    domain: data.map(accessors.x),
    range: [layout.margin.left, xMax],
    round: true,
    padding: 0.2,
  });

  const yScale = scaleLinear({
    domain: [0, Math.max(...data.map(accessors.y))],
    range: [yMax, 0],
    nice: true,
  });

  const getBarProps = d => {
    const width = xScale.bandwidth();
    const height = innerHeight - yScale(accessors.y(d));
    const x = xScale(accessors.x(d));
    const y = yMax - height;

    return { x, y, width, height, fill: layout.colors.bar };
  };

  const getLeftTickLabelProps = () => ({
    fontSize: layout.font.size,
    fontFamily: layout.font.family,
    fill: layout.colors.label,
    textAnchor: "end",
  });

  const getBottomTickLabelProps = () => ({
    fontSize: layout.font.size,
    fontFamily: layout.font.family,
    fill: layout.colors.label,
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
      {data.map((d, index) => (
        <Bar key={index} {...getBarProps(d)} fill="#509ee3" />
      ))}
      <AxisLeft
        scale={yScale}
        left={layout.margin.left}
        label={bottomLabel}
        hideTicks
        hideAxisLine
        tickLabelProps={() => getLeftTickLabelProps()}
      />
      <AxisBottom
        scale={xScale}
        top={yMax}
        label={leftLabel}
        numTicks={data.length}
        stroke={layout.colors.stroke}
        tickStroke={layout.colors.stroke}
        tickFormat={d => new Date(d).toLocaleDateString()}
        tickLabelProps={() => getBottomTickLabelProps()}
      />
    </svg>
  );
};

TimeSeriesBarChart.propTypes = propTypes;

export default TimeSeriesBarChart;
