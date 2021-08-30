/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import { Bar } from "@visx/shape";
import { AxisLeft, AxisBottom } from "@visx/axis";
import { scaleBand, scaleLinear } from "@visx/scale";
import { bottomAxisTickStyles, leftAxisTickStyles } from "../utils.js";
import { GridRows } from "@visx/grid";

export default function CategoricalBar(
  { data, yScaleType = scaleLinear, accessors, labels },
  layout,
) {
  const leftMargin = 55;
  const xAxisScale = scaleBand({
    domain: data.map(accessors.x),
    range: [leftMargin, layout.xMax],
    round: true,
    padding: 0.2,
  });

  const yAxisScale = yScaleType({
    domain: [0, Math.max(...data.map(accessors.y))],
    range: [layout.yMax, 0],
    nice: true,
  });

  return (
    <svg width={layout.width} height={layout.height}>
      <GridRows
        scale={yAxisScale}
        width={layout.xMax - leftMargin}
        left={leftMargin}
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
          />
        );
      })}
      <AxisLeft
        hideTicks
        hideAxisLine
        tickFormat={d => {
          return String(d);
        }}
        scale={yAxisScale}
        label={labels.left || t`Count`}
        left={leftMargin}
        tickLabelProps={() => leftAxisTickStyles(layout)}
      />
      <AxisBottom
        hideTicks={false}
        tickStroke={layout.colors.axis.stroke}
        numTicks={5}
        top={layout.yMax}
        scale={xAxisScale}
        stroke={layout.colors.axis.stroke}
        label={labels.bottom || t`Category`}
        tickLabelProps={() => bottomAxisTickStyles(layout)}
      />
    </svg>
  );
}
