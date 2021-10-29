import React from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { AreaClosed, Bar, LinePath } from "@visx/shape";
import { useTimeseriesChart } from "./use-timeseries-chart";
import { ChartSize, Data, Series } from "./types";
import { getX, getY } from "./utils/scale";

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
        [new Date(2020, 0, 1), 1],
        [new Date(2020, 1, 1), 4],
        [new Date(2020, 3, 1), 2],
        [new Date(2020, 4, 1), 5],
        [new Date(2020, 8, 1), 9],
      ],
      settings: {
        type: "line",
        color: "black",
      },
    },
    {
      label: "Area series",
      data: [
        [new Date(2020, 3, 1), 4],
        [new Date(2020, 6, 1), 3],
        [new Date(2020, 7, 1), 2],
      ],
      settings: {
        type: "area",
        color: "black",
      },
    },

    {
      label: "Bar series",
      data: [
        [new Date(2020, 0, 1), 3],
        [new Date(2020, 1, 1), 7],
        [new Date(2020, 3, 1), 4],
        [new Date(2020, 5, 1), 8],
        [new Date(2020, 11, 1), 4],
      ],
      settings: {
        type: "bar",
        color: "black",
      },
    },
  ],
};

interface ChartProps {
  width: number;
  height: number;
  series: Series<Date, number>[];
}

interface BarsProps {
  data: Data<Date, number>;
  yScale: any;
  xScale: any;
  innerHeight: number;
  size: ChartSize;
}

const Bars = ({ data, yScale, xScale, innerHeight }: BarsProps) => {
  return (
    <>
      {data.map((datum, index) => {
        const x = xScale(getX(datum).valueOf());
        const y = yScale(getY(datum));
        const width = xScale.bandwidth();
        const height = innerHeight - yScale(getY(datum));

        return (
          <Bar
            key={index}
            fill="red"
            width={width}
            height={height}
            x={x}
            y={y}
          />
        );
      })}
    </>
  );
};

const Chart = () => {
  const { width, height, series }: ChartProps = testProps;

  const dimensions = { width, height };

  const innerHeight = height - margins.top - margins.bottom;

  const { xScale, xTicks, xScaleBand, yScale, yTicks } = useTimeseriesChart(
    series,
    {
      dimensions,
      margins,
    },
  );

  const lines = series.filter(series => series.settings.type === "line");
  const areas = series.filter(series => series.settings.type === "area");
  const bars = series.filter(series => series.settings.type === "bar");

  return (
    <svg width={width} height={height}>
      <AxisLeft
        top={margins.top}
        left={margins.left}
        scale={yScale}
        stroke={"black"}
        numTicks={yTicks}
        tickLength={4}
        tickStroke={"black"}
        tickLabelProps={() => ({
          fontSize: 10,
          fontFamily: "Lato",
          textAnchor: "end",
          fill: "black",
          dy: "0.35em",
          dx: "-0.25em",
        })}
      />
      <AxisBottom
        top={height - margins.bottom}
        left={margins.left}
        scale={xScale}
        stroke={"black"}
        numTicks={xTicks}
        tickLength={4}
        tickStroke={"black"}
        tickLabelProps={() => ({
          fontSize: 10,
          fontFamily: "Lato",
          textAnchor: "middle",
          fill: "black",
        })}
      />
      <g transform={`translate(${margins.left} ${margins.top})`}>
        {lines.map(s => (
          <LinePath
            key={s.label}
            data={s.data}
            x={d => xScale(getX(d))}
            y={d => yScale(getY(d))}
            stroke="black"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {areas.map(s => (
          <AreaClosed
            yScale={yScale}
            key={s.label}
            data={s.data}
            x={d => xScale(getX(d))}
            y={d => yScale(getY(d))}
            stroke="red"
            fill="black"
            opacity={0.1}
            strokeWidth={2}
          />
        ))}

        {bars.map(s => (
          <Bars
            key={s.label}
            innerHeight={innerHeight}
            data={s.data}
            xScale={xScaleBand}
            yScale={yScale}
            size={{ dimensions, margins }}
          />
        ))}
      </g>
    </svg>
  );
};

export default Chart;
