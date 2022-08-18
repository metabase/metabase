import React from "react";
import { Group } from "@visx/group";
import { PositionScale } from "@visx/shape/lib/types";
import { LineArea } from "metabase/static-viz/components/XYChart/shapes/LineArea";
import {
  HydratedSeries,
  SeriesDatum,
  StackedDatum,
} from "metabase/static-viz/components/XYChart/types";
import { getY, getY1 } from "metabase/static-viz/components/XYChart/utils";
import { Text } from "@visx/text";

import type { TextProps } from "@visx/text";

const VALUES_MARGIN = 6;

interface AreaSeriesProps {
  series: HydratedSeries[];
  yScale: PositionScale;
  xAccessor: (datum: SeriesDatum) => number;
  showValues: boolean;
  valueFormatter: (value: number) => string;
  valueProps: Partial<TextProps>;
}

export const AreaSeriesStacked = ({
  series,
  yScale,
  xAccessor,
  showValues,
  valueFormatter,
  valueProps,
}: AreaSeriesProps) => {
  const yAccessor = (d: StackedDatum) => yScale(getY(d)) ?? 0;
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
      {/* Render all data point values last so they stay on top of the area chart background making them more legible */}
      {showValues &&
        series[series.length - 1].stackedData?.map((datum, index) => {
          return (
            <Text
              key={index}
              x={(xAccessor as any)(datum)}
              y={yAccessor(datum) - VALUES_MARGIN}
              textAnchor="middle"
              verticalAnchor="end"
              {...valueProps}
            >
              {valueFormatter(getY(datum))}
            </Text>
          );
        })}
    </Group>
  );
};
