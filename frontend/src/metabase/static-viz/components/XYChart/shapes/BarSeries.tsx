import React, { Fragment } from "react";
import { Bar } from "@visx/shape";
import { Group } from "@visx/group";
import { scaleBand } from "@visx/scale";
import { PositionScale } from "@visx/shape/lib/types";
import { getY } from "metabase/static-viz/components/XYChart/utils";
import { Text } from "@visx/text";

import type {
  Series,
  SeriesDatum,
} from "metabase/static-viz/components/XYChart/types";
import type { TextProps } from "@visx/text";

const VALUES_MARGIN = 6;

interface BarSeriesProps {
  series: Series[];
  yScaleLeft: PositionScale | null;
  yScaleRight: PositionScale | null;
  xAccessor: (datum: SeriesDatum) => number;
  bandwidth: number;
  showValues: boolean;
  valueFormatter: (value: number) => string;
  valueProps: Partial<TextProps>;
}

export const BarSeries = ({
  series,
  yScaleLeft,
  yScaleRight,
  xAccessor,
  bandwidth,
  showValues,
  valueFormatter,
  valueProps,
}: BarSeriesProps) => {
  const innerBarScaleDomain = series.map((_, index) => index);

  const innerBarScale = scaleBand({
    domain: innerBarScaleDomain,
    range: [0, bandwidth],
  });

  return (
    <Group>
      {series.map((series, seriesIndex) => {
        const yScale =
          series.yAxisPosition === "left" ? yScaleLeft : yScaleRight;

        if (!yScale) {
          return null;
        }

        return (
          <Fragment key={seriesIndex}>
            {series.data.map((datum, index) => {
              const groupX = xAccessor(datum);
              const innerX = innerBarScale(seriesIndex) ?? 0;

              const x = groupX + innerX;
              const width = innerBarScale.bandwidth();

              const yZero = yScale(0) ?? 0;
              const yValue = yScale(getY(datum)) ?? 0;
              const y = Math.min(yValue, yZero);
              const height = Math.abs(yValue - yZero);

              return (
                <>
                  <Bar
                    key={index}
                    fill={series.color}
                    width={width}
                    height={height}
                    x={x}
                    y={y}
                  />
                  {showValues && (
                    <Text
                      x={x + width / 2}
                      y={y - VALUES_MARGIN}
                      width={width}
                      textAnchor="middle"
                      verticalAnchor="end"
                      {...valueProps}
                    >
                      {valueFormatter(getY(datum))}
                    </Text>
                  )}
                </>
              );
            })}
          </Fragment>
        );
      })}
    </Group>
  );
};
