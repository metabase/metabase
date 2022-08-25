import React from "react";
import { Group } from "@visx/group";
import { PositionScale } from "@visx/shape/lib/types";
import { LineArea } from "metabase/static-viz/components/XYChart/shapes/LineArea";
import { getY } from "metabase/static-viz/components/XYChart/utils";
import { AreaSeriesStacked } from "./AreaSeriesStacked";

import type {
  Series,
  SeriesDatum,
} from "metabase/static-viz/components/XYChart/types";

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

        const yAccessor = (d: SeriesDatum) => yScale(getY(d)) ?? 0;
        return (
          <LineArea
            key={s.name}
            yScale={yScale}
            color={s.color}
            data={s.data}
            x={xAccessor}
            y={yAccessor}
            y1={yScale(0) ?? 0}
          />
        );
      })}
    </Group>
  );
};
