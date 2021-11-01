import React from "react";
import { Bar} from "@visx/shape";
import { Group } from "@visx/group";
import { scaleBand } from "@visx/scale";
import type { ScaleBand, ScaleLinear } from "d3-scale";
import { Series } from "./types";
import { getX, getY } from "./utils/scale";

interface BarSeriesProps {
  series: Series<Date, number>[];
  xScale: ScaleBand<number>;
  yScale: ScaleLinear<number, number>;
  innerHeight: number;
}

export const BarSeries = ({ series, yScale, xScale, innerHeight }: BarSeriesProps) => {
  const innerBarScaleDomain = series.map(series => series.label);

  const innerBarScale = scaleBand({
    domain: innerBarScaleDomain,
    range: [0, xScale.bandwidth()],
    padding: 0.05,
  });

  return (
    <Group>
      {series.map((series: Series<Date, number>) => {
        return (
          <>
            {series.data.map((datum, index) => {
              const groupX = xScale(getX(datum).valueOf()) ?? 0;
              const innerX = innerBarScale(series.label) ?? 0;

              const x = groupX + innerX;
              const y = yScale(getY(datum)) ?? 0;

              const width = innerBarScale.bandwidth();
              const height = innerHeight - y;

              return (
                <Bar
                  key={index}
                  fill={series.settings.color}
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
