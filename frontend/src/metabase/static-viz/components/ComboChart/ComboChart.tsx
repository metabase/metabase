import React from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { useTimeseriesChart } from "./use-timeseries-chart";
import { Series } from "../blocks/types";
import { BarSeries } from "../blocks/BarSeries";
import { AreaSeries } from "../blocks/AreaSeries";
import { LineSeries } from "../blocks/LineSeries";

const margins = {
  top: 10,
  left: 55,
  right: 40,
  bottom: 40,
};

const testProps: ChartProps = {
  width: 540,
  height: 300,
  series: [
    {
      label: "Line series",
      data: [
        [new Date(2019, 9, 1), 4],
        [new Date(2020, 0, 1), 1],
        [new Date(2020, 1, 1), 3],
        [new Date(2020, 2, 1), 1],
        [new Date(2020, 3, 1), 3],
        [new Date(2020, 4, 1), 1],
        [new Date(2020, 6, 1), 9],
      ],
      settings: {
        type: "line",
        color: "#88BF4D",
      },
    },
    {
      label: "Area series",
      data: [
        [new Date(2020, 0, 1), 3],
        [new Date(2020, 1, 1), 1],
        [new Date(2020, 2, 1), 3],
        [new Date(2020, 3, 1), 1],
        [new Date(2020, 4, 1), 3],
      ],
      settings: {
        type: "area",
        color: "#EF8C8C",
      },
    },
    {
      label: "Area series 2",
      data: [
        [new Date(2020, 0, 1), 2],
        [new Date(2020, 1, 1), 14],
        [new Date(2020, 2, 1), 18],
        [new Date(2020, 3, 1), 15],
        [new Date(2020, 9, 1), 8],
      ],
      settings: {
        type: "area",
        color: "#A989C5",
      },
    },

    {
      label: "Bar series",
      data: [
        [new Date(2019, 9, 1), 4],
        [new Date(2020, 0, 1), 2],
        [new Date(2020, 1, 1), 4],
        [new Date(2020, 2, 1), 2],
        [new Date(2020, 3, 1), 4],
        [new Date(2020, 4, 1), 2],
      ],
      settings: {
        type: "bar",
        color: "#A989C5",
      },
    },
    {
      label: "Bar series 2",
      data: [
        [new Date(2020, 0, 1), 2],
        [new Date(2020, 1, 1), 4],
        [new Date(2020, 2, 1), 2],
        [new Date(2020, 3, 1), 4],
        [new Date(2020, 4, 1), 2],
      ],
      settings: {
        type: "bar",
        color: "#f2a86f",
      },
    },
    {
      label: "Bar series 3",
      data: [
        [new Date(2020, 0, 1), 2],
        [new Date(2020, 1, 1), 4],
        [new Date(2020, 2, 1), 2],
        [new Date(2020, 3, 1), 4],
        [new Date(2020, 4, 1), 2],
      ],
      settings: {
        type: "bar",
        color: "#98D9D9",
      },
    },
  ],
};

const palette = {
  axes: "#949aab",
};

interface ChartProps {
  width: number;
  height: number;
  series: Series<Date, number>[];
}

const Chart = () => {
  const { width, height, series }: ChartProps = testProps;

  const dimensions = { width, height };

  const innerHeight = height - margins.top - margins.bottom;
  const innerWidth = width - margins.left - margins.right;

  const { xScale, yScale } = useTimeseriesChart(series, {
    dimensions,
    margins,
  });

  const lines = series.filter(series => series.settings.type === "line");
  const areas = series.filter(series => series.settings.type === "area");
  const bars = series.filter(series => series.settings.type === "bar");

  return (
    <svg width={width} height={height}>
      <GridRows
        scale={yScale}
        top={margins.top}
        left={margins.left}
        width={innerWidth}
        strokeDasharray="4"
      />

      <AxisLeft
        hideTicks
        hideAxisLine
        top={margins.top}
        left={margins.left}
        scale={yScale}
        stroke={palette.axes}
        tickLength={4}
        tickStroke={palette.axes}
        tickLabelProps={() => ({
          fontSize: 10,
          fontFamily: "Lato",
          textAnchor: "end",
          fill: palette.axes,
        })}
      />
      <AxisBottom
        top={height - margins.bottom}
        left={margins.left}
        scale={xScale}
        stroke={palette.axes}
        numTicks={3}
        tickLength={4}
        tickStroke={palette.axes}
        tickLabelProps={() => ({
          fontSize: 11,
          fontFamily: "Lato",
          textAnchor: "middle",
          fill: palette.axes,
        })}
      />

      <Group top={margins.top} left={margins.left}>
        <BarSeries
          series={bars}
          yScale={yScale}
          xScale={xScale}
          innerHeight={innerHeight}
        />
        <AreaSeries series={areas} yScale={yScale} xScale={xScale} />
        <LineSeries series={lines} yScale={yScale} xScale={xScale} />
      </Group>
    </svg>
  );
};

export default Chart;
