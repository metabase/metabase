import React from "react";
import PropTypes from "prop-types";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { scaleLinear, scaleTime } from "@visx/scale";
import { AreaClosed, LinePath } from "@visx/shape";
import { formatDate } from "../../lib/formatDate";
import { formatNumber } from "../../lib/formatNumber";

const propTypes = {
  series: PropTypes.arrayOf(
    PropTypes.shape({
      data: PropTypes.array.isRequired,
      type: PropTypes.oneOf(["line", "area"]),
    }),
  ).isRequired,
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
    accents: [
      "#509EE3",
      "#88BF4D",
      "#A989C5",
      "#EF8C8C",
      "#F9D45C",
      "#F2A86F",
      "#98D9D9",
      "#7172AD",
    ],
    textLight: "#b8bbc3",
    textMedium: "#949aab",
  },
  numTicks: 5,
  strokeWidth: 2,
  strokeDasharray: "4",
  fillOpacity: 0.2,
};

const TimeSeriesMultiChart = ({ series, accessors, settings, labels }) => {
  const xMax = layout.width - layout.margin.right;
  const yMax = layout.height - layout.margin.bottom;
  const innerWidth = xMax - layout.margin.left;
  const leftLabel = labels?.left;
  const bottomLabel = labels?.bottom;

  const xScale = scaleTime({
    domain: [
      Math.min(...series.flatMap(s => s.data.map(accessors.x))),
      Math.max(...series.flatMap(s => s.data.map(accessors.x))),
    ],
    range: [layout.margin.left, xMax],
  });

  const yScale = scaleLinear({
    domain: [0, Math.max(...series.flatMap(s => s.data.map(accessors.y)))],
    range: [yMax, 0],
    nice: true,
  });

  const getChartShape = (s, index) => {
    switch (s.type) {
      case "line":
        return getLineShape(s.data, index);
      case "area":
        return getAreaShape(s.data, index);
    }
  };

  const getChartColor = index => {
    return layout.colors.accents[index % layout.colors.accents.length];
  };

  const getLineShape = (data, index) => {
    return [
      <LinePath
        key={`line-${index}`}
        data={data}
        stroke={getChartColor(index)}
        strokeWidth={layout.strokeWidth}
        x={d => xScale(accessors.x(d))}
        y={d => yScale(accessors.y(d))}
      />,
    ];
  };

  const getAreaShape = (data, index) => {
    return [
      <AreaClosed
        key={`area-fill-${index}`}
        data={data}
        yScale={yScale}
        fill={getChartColor(index)}
        opacity={layout.fillOpacity}
        x={d => xScale(accessors.x(d))}
        y={d => yScale(accessors.y(d))}
      />,
      <LinePath
        key={`area-line-${index}`}
        data={data}
        stroke={getChartColor(index)}
        strokeWidth={layout.strokeWidth}
        x={d => xScale(accessors.x(d))}
        y={d => yScale(accessors.y(d))}
      />,
    ];
  };

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
        strokeDasharray={layout.strokeDasharray}
      />
      {series.flatMap((s, index) => getChartShape(s, index))}
      <AxisLeft
        scale={yScale}
        left={layout.margin.left}
        label={leftLabel}
        hideTicks
        hideAxisLine
        tickFormat={value => formatNumber(value, settings?.y)}
        tickLabelProps={() => getLeftTickLabelProps()}
      />
      <AxisBottom
        scale={xScale}
        top={yMax}
        label={bottomLabel}
        numTicks={layout.numTicks}
        stroke={layout.colors.textLight}
        tickStroke={layout.colors.textLight}
        tickFormat={value => formatDate(value, settings?.x)}
        tickLabelProps={() => getBottomTickLabelProps()}
      />
    </svg>
  );
};

TimeSeriesMultiChart.propTypes = propTypes;

export default TimeSeriesMultiChart;
