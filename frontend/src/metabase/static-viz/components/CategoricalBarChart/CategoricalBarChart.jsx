import React from "react";
import PropTypes from "prop-types";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar } from "@visx/shape";
import { Text } from "@visx/text";
import {
  getXTickWidth,
  getXTickLabelProps,
  getYTickLabelProps,
  getYTickWidth,
  getRotatedXTickHeight,
  getLabelProps,
} from "../../lib/axes";
import { formatNumber } from "../../lib/numbers";
import { truncateText } from "../../lib/text";
import { POSITIONAL_ACCESSORS } from "../../constants/accessors";

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
  labelFontWeight: 700,
  labelPadding: 12,
  maxTickWidth: 100,
  strokeDasharray: "4",
};

const CategoricalBarChart = ({
  data,
  accessors = POSITIONAL_ACCESSORS,
  settings,
  labels,
}) => {
  const colors = settings?.colors;
  const isVertical = data.length > 10;
  const xTickWidth = getXTickWidth(
    data,
    accessors,
    layout.maxTickWidth,
    layout.font.size,
  );
  const xTickHeight = getRotatedXTickHeight(xTickWidth);
  const yTickWidth = getYTickWidth(data, accessors, settings, layout.font.size);
  const xLabelOffset = xTickHeight + layout.labelPadding + layout.font.size;
  const yLabelOffset = yTickWidth + layout.labelPadding;
  const xMin = yLabelOffset + layout.font.size * 1.5;
  const xMax = layout.width - layout.margin.right;
  const yMin = isVertical ? xLabelOffset : layout.margin.bottom;
  const yMax = layout.height - yMin;
  const innerWidth = xMax - xMin;
  const innerHeight = yMax - layout.margin.top;
  const textBaseline = Math.floor(layout.font.size / 2);
  const leftLabel = labels?.left;
  const bottomLabel = !isVertical ? labels?.bottom : undefined;
  const palette = { ...layout.colors, ...colors };

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

    return { x, y, width, height, fill: palette.brand };
  };

  const getXTickProps = ({ x, y, formattedValue, ...props }) => {
    const textWidth = isVertical ? xTickWidth : xScale.bandwidth();
    const truncatedText = truncateText(
      formattedValue,
      textWidth,
      layout.font.size,
    );
    const transform = isVertical
      ? `rotate(45, ${x} ${y}) translate(-${textBaseline} 0)`
      : undefined;

    return { ...props, x, y, transform, children: truncatedText };
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
        labelProps={getLabelProps(layout)}
        tickFormat={value => formatNumber(value, settings?.y)}
        tickLabelProps={() => getYTickLabelProps(layout)}
      />
      <AxisBottom
        scale={xScale}
        top={yMax}
        label={bottomLabel}
        numTicks={data.length}
        stroke={palette.textLight}
        tickStroke={palette.textLight}
        labelProps={getLabelProps(layout)}
        tickComponent={props => <Text {...getXTickProps(props)} />}
        tickLabelProps={() => getXTickLabelProps(layout, isVertical)}
      />
    </svg>
  );
};

CategoricalBarChart.propTypes = propTypes;

export default CategoricalBarChart;
