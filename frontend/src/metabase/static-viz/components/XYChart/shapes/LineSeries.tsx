import React from "react";
import { Group } from "@visx/group";
import { LinePath } from "@visx/shape";
import { PositionScale } from "@visx/shape/lib/types";
import { getY } from "metabase/static-viz/components/XYChart/utils";
import {
  Series,
  SeriesDatum,
} from "metabase/static-viz/components/XYChart/types";

interface LineSeriesProps {
  series: Series[];
  yScaleLeft: PositionScale | null;
  yScaleRight: PositionScale | null;
  xAccessor: (datum: SeriesDatum) => number;
}

export const LineSeries = ({
  series,
  yScaleLeft,
  yScaleRight,
  xAccessor,
}: LineSeriesProps) => {
  return (
    <Group>
      {series.map(s => {
        const yScale = s.yAxisPosition === "left" ? yScaleLeft : yScaleRight;
        if (!yScale) {
          return null;
        }

        return (
          <LinePath
            key={s.name}
            data={s.data}
            x={xAccessor}
            y={d => yScale(getY(d)) ?? 0}
            stroke={s.color}
            strokeWidth={2}
          />
        );
      })}
    </Group>
  );
};
