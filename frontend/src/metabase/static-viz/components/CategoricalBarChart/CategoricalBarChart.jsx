import React from "react";
import PropTypes from "prop-types";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar } from "@visx/shape";
import { Text } from "@visx/text";
import {
  getXTickHeight,
  getXTickLabelProps,
  getYTickLabelProps,
  getYTickWidth,
} from "../../lib/axes";
import { formatNumber } from "../../lib/numbers";

const propTypes = {
  data: PropTypes.array.isRequired,
  accessors: PropTypes.shape({
    x: PropTypes.func.isRequired,
    y: PropTypes.func.isRequired,
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
  barPadding: 0.2,
  labelPadding: 12,
  strokeDasharray: "4",
};

const CategoricalBarChart = ({ data, accessors, settings, labels }) => {
  const isVertical = data.length > 10;
  const xTickHeight = getXTickHeight(data, accessors);
  const yTickWidth = getYTickWidth(data, accessors, settings);
  const xLabelOffset = xTickHeight + layout.labelPadding + layout.font.size;
  const yLabelOffset = yTickWidth + layout.labelPadding;
  const xMin = yLabelOffset + layout.font.size * 1.5;
  const xMax = layout.width - layout.margin.right;
  const yMin = isVertical ? xLabelOffset : layout.margin.bottom;
  const yMax = layout.height - yMin;
  const innerWidth = xMax - xMin;
  const innerHeight = yMax - layout.margin.top;
  const leftLabel = labels?.left;
  const bottomLabel = !isVertical ? labels?.bottom : undefined;

  const xScale = scaleBand({
    domain: data.map(accessors.x),
    range: [xMin, xMax],
    round: true,
    padding: layout.barPadding,
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

    return { x, y, width, height, fill: layout.colors.brand };
  };

  const getBottomTickProps = ({ x, y, formattedValue, ...props }) => {
    const fontShift = Math.floor(layout.font.size / 2);
    const transform = isVertical
      ? `rotate(45, ${x} ${y}) translate(-${fontShift} 0)`
      : undefined;

    return { ...props, x, y, transform, children: formattedValue };
  };

  return (
    <svg width={layout.width} height={layout.height}>
      <GridRows
        scale={yScale}
        left={xMin}
        width={innerWidth}
        strokeDasharray={layout.strokeDasharray}
      />
      {data.map((d, index) => (
        <Bar key={index} {...getBarProps(d)} />
      ))}
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
        numTicks={data.length}
        stroke={layout.colors.textLight}
        tickStroke={layout.colors.textLight}
        tickComponent={props => <Text {...getBottomTickProps(props)} />}
        tickLabelProps={() => getXTickLabelProps(layout, isVertical)}
      />
    </svg>
  );
};

CategoricalBarChart.propTypes = propTypes;

export default CategoricalBarChart;
