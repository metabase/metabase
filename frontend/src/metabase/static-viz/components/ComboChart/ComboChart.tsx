import React from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { AreaClosed, LinePath } from "@visx/shape";
import { useTimeseriesChart } from "./use-timeseries-chart";
import { Series } from "./types";

const margins = {
  top: 0,
  left: 55,
  right: 40,
  bottom: 40,
};

// const props: ChartProps = {
//   width: 540,
//   height: 300,
// };

interface ChartProps {
  width: number;
  height: number;
  series: Series<Date, number>[];
}

const Chart = ({ width, height, series }: ChartProps) => {
  const dimensions = { width, height };

  const {
    xScale,
    xTicks,
    xRangeMax,
    yScale,
    yTicks,
    yRangeMax,
  } = useTimeseriesChart(series, { dimensions, margins });

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
        {series.map(s => (
          <LinePath
            key={s.label}
            data={s.data}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </g>
    </svg>
  );
};

export default Chart;
