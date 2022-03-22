import React from "react";
import { Group } from "@visx/group";
import { PositionScale } from "@visx/shape/lib/types";
import { LineArea } from "metabase/static-viz/components/XYChart/shapes/LineArea";
import {
  Series,
  SeriesDatum,
} from "metabase/static-viz/components/XYChart/types";
import { getY } from "metabase/static-viz/components/XYChart/utils";
import { AreaSeriesStacked } from "./AreaSeriesStacked";

interface AreaSeriesProps {
  series: Series[];
  yScaleLeft: PositionScale | null;
  yScaleRight: PositionScale | null;
  xAccessor: (datum: SeriesDatum) => number;
  areStacked?: boolean;
}

export const AreaSeries = ({
  series,
  yScaleLeft,
  yScaleRight,
  xAccessor,
  areStacked,
}: AreaSeriesProps) => {
  if (areStacked) {
    return (
      <AreaSeriesStacked
        series={series}
        // Stacked charts work only for a single dataset with one dimension and left Y-axis
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        yScale={yScaleLeft!}
        xAccessor={xAccessor}
      />
    );
  }

  return (
    <Group>
      {series.map(s => {
        const yScale = s.yAxisPosition === "left" ? yScaleLeft : yScaleRight;

        if (!yScale) {
          return null;
        }

        return (
          <LineArea
            key={s.name}
            yScale={yScale}
            color={s.color}
            data={s.data}
            x={xAccessor as any}
            y={d => yScale(getY(d)) ?? 0}
            y1={yScale(0) ?? 0}
          />
        );
      })}
    </Group>
  );
};
