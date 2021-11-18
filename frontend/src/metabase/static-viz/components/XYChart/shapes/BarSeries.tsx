import React from "react";
import { Bar} from "@visx/shape";
import { Group } from "@visx/group";
import { scaleBand } from "@visx/scale";
import type { ScaleBand, ScaleLinear } from "d3-scale";
import { Series } from "../types";
import { getX, getY } from "../utils";

interface BarSeriesProps {
  series: Series[];
  xScale: ScaleBand<string | number>
  yScale: ScaleLinear<number, number>;
  innerHeight: number;
}

export const BarSeries = ({ series, yScale, xScale }: BarSeriesProps) => {
  const innerBarScaleDomain = series.map(series => series.name);

  const innerBarScale = scaleBand({
    domain: innerBarScaleDomain,
    range: [0, xScale.bandwidth()],
    padding: 0.1,
  });

  return (
    <Group>
      {series.map((series) => {
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
