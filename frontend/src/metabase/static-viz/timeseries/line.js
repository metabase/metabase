/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import { LinePath } from "@visx/shape";
import { AxisLeft, AxisBottom } from "@visx/axis";
import { scaleLinear, scaleOrdinal, scaleTime } from "@visx/scale";
import { bottomAxisTickStyles, leftAxisTickStyles } from "../utils";
import { GridRows } from "@visx/grid";

export default function TimeseriesLine(
  { data, yScaleType = scaleLinear, accessors, labels },
  layout,
) {
  const leftMargin = 55;
  let multiScale, categories;

  const xAxisScale = scaleTime({
    domain: [
      Math.min(...data.map(accessors.x)),
      Math.max(...data.map(accessors.x)),
    ],
    range: [leftMargin, layout.xMax],
  });

  // Y scale
  const yAxisScale = yScaleType({
    domain: [0, Math.max(...data.map(accessors.y))],
    range: [layout.yMax, 0],
    nice: true,
  });

  if (accessors.multi) {
    multiScale = scaleOrdinal({
      domain: data.map(accessors.multi),
      range: ["#509ee3", "#EF8C8C", "#88BF4D", "#98D9D9", "#7173AD"],
    });
    categories = data.map(accessors.multi);
  }

  return (
    <svg width={layout.width} height={layout.height}>
      <GridRows
        scale={yAxisScale}
        width={layout.xMax - leftMargin}
        left={leftMargin}
        strokeDasharray="4"
      />
      {multiScale ? (
        categories.map(c => {
          return (
            <LinePath
              key={`series-${c}`}
              data={data.filter(d => {
                return accessors.multi(d) === c;
              })}
              stroke={multiScale(accessors.multi(c))}
              x={d => xAxisScale(accessors.x(d))}
              y={d => yAxisScale(accessors.y(d))}
            />
          );
        })
      ) : (
        <LinePath
          data={data}
          stroke={"#509ee3"}
          strokeWidth={2}
          x={d => xAxisScale(accessors.x(d))}
          y={d => yAxisScale(accessors.y(d))}
        />
      )}
      <AxisLeft
        label={labels.left || t`Metric`}
        hideTicks
        hideAxisLine
        tickFormat={d => String(d)}
        scale={yAxisScale}
        left={leftMargin}
        tickLabelProps={() => leftAxisTickStyles(layout)}
      />
      <AxisBottom
        label={labels.bottom || t`Dimension`}
        hideTicks={false}
        numTicks={5}
        top={layout.yMax}
        stroke={layout.colors.axis.stroke}
        tickFormat={d => new Date(d).toLocaleDateString("en")}
        scale={xAxisScale}
        tickLabelProps={() => bottomAxisTickStyles(layout)}
      />
    </svg>
  );
}
