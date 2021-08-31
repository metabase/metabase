/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Bar } from "@visx/shape";
import { GridRows } from "@visx/grid";
import { scaleBand, scaleLinear } from "@visx/scale";
import { formatDate } from "metabase/static-viz/lib/formatting";
import { leftAxisTickStyles } from "metabase/static-viz/lib/styling";

export default function TimeseriesBar(
  { data, accessors, settings, labels },
  layout,
) {
  const leftMargin = 55;

  const xAxisScale = scaleBand({
    domain: data.map(accessors.x),
    range: [leftMargin, layout.xMax],
    round: true,
    padding: 0.2,
  });

  const yAxisScale = scaleLinear({
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
        scale={yAxisScale}
        label={labels.left || t`Count`}
        left={leftMargin}
        tickLabelProps={() => leftAxisTickStyles(layout)}
      />
      <AxisBottom
        hideTicks={false}
        numTicks={5}
        top={layout.yMax}
        tickStroke={layout.colors.axis.stroke}
        tickFormat={d => formatDate(d, settings?.x)}
        scale={xAxisScale}
        stroke={layout.colors.axis.stroke}
        label={labels.bottom || t`Time`}
        tickLabelProps={() => bottomAxisTickStyles(layout)}
      />
    </svg>
  );
}
