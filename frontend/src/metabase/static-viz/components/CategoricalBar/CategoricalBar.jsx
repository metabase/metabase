import React from "react";
import PropTypes from "prop-types";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar } from "@visx/shape";

const propTypes = {
  data: PropTypes.array,
  accessors: PropTypes.shape({
    x: PropTypes.func,
    y: PropTypes.func,
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
  colors: {
    label: "#949aab",
    stroke: "#b8bbc3",
  },
};

const CategoricalBar = ({ data, accessors, labels }) => {
  const xMax = layout.width - layout.margin.right;
  const yMax = layout.height - layout.margin.bottom;
  const innerWidth = xMax - layout.margin.left;
  const innerHeight = yMax - layout.margin.top;

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

  return (
    <svg width={layout.width} height={layout.height}>
      <GridRows
        scale={yScale}
        left={layout.margin.left}
        width={innerWidth}
        strokeDasharray="4"
      />
      {data.map((d, index) => {
        const barWidth = xScale.bandwidth();
        const barHeight = innerHeight - yScale(accessors.y(d));
        const x = xScale(accessors.x(d));
        const y = yMax - barHeight;

        return (
          <Bar
            key={index}
            width={barWidth}
            height={barHeight}
            x={x}
            y={y}
            fill="#509ee3"
          />
        );
      })}
      <AxisLeft
        scale={yScale}
        left={layout.margin.left}
        label={labels.left}
        hideTicks
        hideAxisLine
        tickLabelProps={() => ({
          fontSize: 11,
          fontFamily: "Lato, sans-serif",
          fill: layout.colors.label,
          textAnchor: "end",
        })}
      />
      <AxisBottom
        scale={xScale}
        top={yMax}
        label={labels.bottom}
        numTicks={data.length}
        stroke={layout.colors.stroke}
        tickStroke={layout.colors.stroke}
        tickLabelProps={() => ({
          fontSize: 11,
          fontFamily: "Lato, sans-serif",
          fill: layout.colors.label,
          textAnchor: "middle",
        })}
      />
    </svg>
  );
};

CategoricalBar.propTypes = propTypes;

export default CategoricalBar;
