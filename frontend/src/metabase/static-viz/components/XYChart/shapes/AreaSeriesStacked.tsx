import React from "react";
import { Group } from "@visx/group";
import { PositionScale } from "@visx/shape/lib/types";
import { LineArea } from "metabase/static-viz/components/XYChart/shapes/LineArea";
import {
  HydratedSeries,
  SeriesDatum,
} from "metabase/static-viz/components/XYChart/types";
import { getY, getY1 } from "metabase/static-viz/components/XYChart/utils";

interface AreaSeriesProps {
  series: HydratedSeries[];
  yScale: PositionScale;
  xAccessor: (datum: SeriesDatum) => number;
}

export const AreaSeriesStacked = ({
  series,
  yScale,
  xAccessor,
}: AreaSeriesProps) => {
  return (
    <Group>
      {series.map(s => {
        return (
          <LineArea
            key={s.name}
            yScale={yScale}
            color={s.color}
            data={s.stackedData}
            x={xAccessor as any}
            y={d => yScale(getY(d)) ?? 0}
            y1={d => yScale(getY1(d)) ?? 0}
          />
        );
      })}
    </Group>
  );
};
