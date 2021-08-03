/* eslint-disable react/prop-types */
import React from "react";
import { Bar } from "@visx/shape";
import { AxisLeft, AxisBottom } from "@visx/axis";
import { scaleBand, scaleLinear, scaleOrdinal } from "@visx/scale";
import { bottomAxisTickStyles, leftAxisTickStyles } from "../utils.js";
import { GridRows } from "@visx/grid";

export default function TimeseriesBar(
  { data, yScaleType = scaleLinear, accessors },
  layout,
) {
  let multiScale, categories;
  const xAxisScale = scaleBand({
    domain: data.map(accessors.x),
    range: [40, layout.xMax],
    round: true,
    padding: 0.2,
  });

  const yAxisScale = yScaleType({
    domain: [0, Math.max(...data.map(accessors.y))],
    range: [layout.yMax, 0],
    nice: true,
  });

  if (accessors.multi) {
    categories = data.map(accessors.multi);
    // eslint-disable-next-line no-unused-vars
    multiScale = scaleOrdinal({
      domain: categories,
      range: ["blue", "yellow", "green", "red"],
    });
  }

  return (
    <svg width={layout.width} height={layout.height}>
      <GridRows
        scale={yAxisScale}
        width={layout.width}
        left={40}
        strokeDasharray="4"
      />
      {data.map(d => {
        const barWidth = xAxisScale.bandwidth();
        const barHeight = layout.yMax - yAxisScale(accessors.y(d));
        const x = xAxisScale(accessors.x(d));
        const y = layout.yMax - barHeight;
        return (
          <Bar
            key={`bar-${x}`}
            width={barWidth}
            height={barHeight}
            x={x}
            y={y}
            fill="#509ee3"
          ></Bar>
        );
      })}
      <AxisLeft
        hideTicks
        hideAxisLine
        tickFormat={d => {
          return String(d);
        }}
        scale={yAxisScale}
        label={"Count"}
        left={40}
        tickLabelProps={() => leftAxisTickStyles(layout)}
      />
      <AxisBottom
        hideTicks={false}
        numTicks={5}
        top={layout.yMax}
        tickFormat={d => new Date(d).toLocaleDateString("en")}
        scale={xAxisScale}
        stroke={layout.colors.axis.stroke}
        label={"Time"}
        tickLabelProps={() => bottomAxisTickStyles(layout)}
      />
    </svg>
  );
}
