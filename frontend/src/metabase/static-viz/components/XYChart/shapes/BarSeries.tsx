import React from "react";
import { Bar} from "@visx/shape";
import { Group } from "@visx/group";
import { scaleBand } from "@visx/scale";
import type { ScaleBand } from "d3-scale";
import { Series } from "../types";
import { getX, getY } from "../utils";
import { PositionScale } from "@visx/shape/lib/types";

interface BarSeriesProps {
  series: Series[];
  xScale: ScaleBand<string | number>
  yScaleLeft: PositionScale | null;
  yScaleRight: PositionScale | null;
}

export const BarSeries = ({ series, yScaleLeft, yScaleRight, xScale }: BarSeriesProps) => {
  const innerBarScaleDomain = series.map(series => series.name);

  const innerBarScale = scaleBand({
    domain: innerBarScaleDomain,
    range: [0, xScale.bandwidth()],
  });

  return (
    <Group>
      {series.map((series) => {
        const yScale = series.yAxisPosition === 'left' ? yScaleLeft! : yScaleRight!

        return (
          <>
            {series.data.map((datum, index) => {

              const groupX = xScale(getX(datum).valueOf()) ?? 0;
              const innerX = innerBarScale(series.name) ?? 0;

              const x = groupX + innerX;
              const width = innerBarScale.bandwidth();

              const yZero = yScale(0)!
              const y = Math.min(yScale(getY(datum)) ?? 0, yZero);
              const height = Math.abs(yScale(getY(datum))! - yScale(0)!)

              return (
                <Bar
                  key={index}
                  fill={series.color}
                  width={width}
                  height={height}
                  x={x}
                  y={y}
                />
              );
            })}
          </>
        );
      })}
    </Group>
  );
};
