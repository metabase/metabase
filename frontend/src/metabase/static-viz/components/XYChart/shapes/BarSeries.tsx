import React from "react";
import { Bar} from "@visx/shape";
import { Group } from "@visx/group";
import { scaleBand } from "@visx/scale";
import { PositionScale } from "@visx/shape/lib/types";
import { Series, SeriesDatum } from "metabase/static-viz/components/XYChart/types";
import { getY } from "metabase/static-viz/components/XYChart/utils";

interface BarSeriesProps {
  series: Series[];
  yScaleLeft: PositionScale | null;
  yScaleRight: PositionScale | null;
  xAccessor: (datum: SeriesDatum) => number,
  bandwidth: number
}

export const BarSeries = ({ series, yScaleLeft, yScaleRight, xAccessor, bandwidth }: BarSeriesProps) => {
  const innerBarScaleDomain = series.map(series => series.name);

  const innerBarScale = scaleBand({
    domain: innerBarScaleDomain,
    range: [0, bandwidth],
  });

  return (
    <Group>
      {series.map((series) => {
        const yScale = series.yAxisPosition === 'left' ? yScaleLeft! : yScaleRight!

        return (
          <>
            {series.data.map((datum, index) => {
              const groupX = xAccessor(datum);
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
