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
import { Text, TextProps } from "@visx/text";

const VALUES_MARGIN = 6;

interface AreaSeriesProps {
  series: Series[];
  yScaleLeft: PositionScale | null;
  yScaleRight: PositionScale | null;
  xAccessor: (datum: SeriesDatum) => number;
  areStacked?: boolean;
  showValues: boolean;
  valueFormatter: (value: number) => string;
  valueProps: Partial<TextProps>;
  valueStep: number;
}

export const AreaSeries = ({
  series,
  yScaleLeft,
  yScaleRight,
  xAccessor,
  areStacked,
  showValues,
  valueFormatter,
  valueProps,
  valueStep,
}: AreaSeriesProps) => {
  if (areStacked) {
    return (
      <AreaSeriesStacked
        series={series}
        // Stacked charts work only for a single dataset with one dimension and left Y-axis
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        yScale={yScaleLeft!}
        xAccessor={xAccessor}
        showValues={showValues}
        valueFormatter={valueFormatter}
        valueProps={valueProps}
        valueStep={valueStep}
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
      {/* Render all data point values last so they stay on top of the area chart background making them more legible */}
      {showValues &&
        series.map(s => {
          const yScale = s.yAxisPosition === "left" ? yScaleLeft : yScaleRight;

          if (!yScale) {
            return null;
          }

          const yAccessor = (d: SeriesDatum) => yScale(getY(d)) ?? 0;
          return s.data.map((datum, index) => {
            return (
              index % valueStep === 0 && (
                <Text
                  key={index}
                  x={xAccessor(datum)}
                  y={yAccessor(datum) - VALUES_MARGIN}
                  textAnchor="middle"
                  verticalAnchor="end"
                  {...valueProps}
                >
                  {valueFormatter(getY(datum))}
                </Text>
              )
            );
          });
        })}
    </Group>
  );
};
