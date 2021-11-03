import React from "react";
import type { ScaleBand } from "d3-scale";
import { Group } from "@visx/group";
import { LinePath } from "@visx/shape";
import { PositionScale } from "@visx/shape/lib/types";
import { Datum, Series } from "../types";
import { getX, getY } from "metabase/static-viz/lib/series";

interface LineSeriesProps {
  series: Series<Date, number>[];
  xScale: ScaleBand<number>;
  yScale: PositionScale;
}

export const LineSeries = ({ series, xScale, yScale }: LineSeriesProps) => {
  return (
    <Group>
      {series.map(s => (
        <LinePath
          key={s.label}
          data={s.data}
          x={d => (xScale(getX(d as Datum<Date, number>).valueOf()) ?? 0) + xScale.bandwidth() / 2}
          y={d => yScale(getY(d as Datum<Date, number>)) ?? 0 }
          stroke={s.settings.color}
          strokeWidth={2}
        />
      ))}
    </Group>
  );
};
