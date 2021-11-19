import React from "react";
import type { ScaleBand } from "d3-scale";
import { Group } from "@visx/group";
import { LinePath } from "@visx/shape";
import { PositionScale } from "@visx/shape/lib/types";
import { getX, getY } from "../utils";
import { Series } from "../types";

interface LineSeriesProps {
  series: Series[];
  xScale: ScaleBand<number | string>;
  yScaleLeft: PositionScale | null;
  yScaleRight: PositionScale | null;
}

export const LineSeries = ({ series, xScale, yScaleLeft, yScaleRight }: LineSeriesProps) => {
  return (
    <Group>
      {series.map(s => {
        const yScale = s.yAxisPosition === 'left' ? yScaleLeft! : yScaleRight!
        return (
        <LinePath
          key={s.name}
          data={s.data}
          x={d => (xScale(getX(d)) ?? 0) + xScale.bandwidth() / 2}
          y={d => yScale(getY(d)) ?? 0 }
          stroke={s.color}
          strokeWidth={2}
        />
      )})}
    </Group>
  );
};
