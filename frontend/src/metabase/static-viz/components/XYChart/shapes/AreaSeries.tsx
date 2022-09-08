import React from "react";
import { Group } from "@visx/group";
import { PositionScale } from "@visx/shape/lib/types";
import { LineArea } from "metabase/static-viz/components/XYChart/shapes/LineArea";
import { getY } from "metabase/static-viz/components/XYChart/utils";
import { AreaSeriesStacked } from "./AreaSeriesStacked";

import type {
  Series,
  SeriesDatum,
  XYAccessor,
} from "metabase/static-viz/components/XYChart/types";

interface AreaSeriesProps {
  series: Series[];
  yScaleLeft: PositionScale | null;
  yScaleRight: PositionScale | null;
  xAccessor: XYAccessor;
  areStacked?: boolean;
}

export const AreaSeries = ({
  series: multipleSeries,
  yScaleLeft,
  yScaleRight,
  xAccessor,
  areStacked,
}: AreaSeriesProps) => {
  if (areStacked) {
    return (
      <AreaSeriesStacked
        series={multipleSeries}
        // Stacked charts work only for a single dataset with one dimension and left Y-axis
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        yScale={yScaleLeft!}
        xAccessor={xAccessor}
      />
    );
  }

  return (
    <Group>
      {multipleSeries.map((series, seriesIndex) => {
        const yScale =
          series.yAxisPosition === "left" ? yScaleLeft : yScaleRight;

        if (!yScale) {
          return null;
        }

        const yAccessor = (d: SeriesDatum) => yScale(getY(d)) ?? 0;
        return (
          <>
            <LineArea
              key={series.name}
              yScale={yScale}
              color={series.color}
              data={series.data}
              x={xAccessor}
              y={yAccessor}
              y1={yScale(0) ?? 0}
            />
            {series.data.map((datum, dataIndex) => {
              return (
                <circle
                  key={`${seriesIndex}-${dataIndex}`}
                  r={2}
                  fill="white"
                  stroke={series.color}
                  strokeWidth={1.5}
                  cx={xAccessor(datum)}
                  cy={yAccessor(datum)}
                />
              );
            })}
          </>
        );
      })}
    </Group>
  );
};
