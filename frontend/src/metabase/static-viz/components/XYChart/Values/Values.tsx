import { Text } from "@visx/text";
import React from "react";
import { getValueStep, getY } from "../utils";

import type { TextProps } from "@visx/text";
import type {
  HydratedSeries,
  SeriesDatum,
  VisualizationType,
  XYAccessor,
} from "../types";
import { PositionScale } from "@visx/shape/lib/types";

const VALUES_MARGIN = 6;
const FLIPPED_VALUES_MARGIN = VALUES_MARGIN + 8;

interface ValuesProps {
  series: HydratedSeries[];
  formatter: (value: number, compact?: boolean) => string;
  valueProps: Partial<TextProps>;
  xScale: XScale;
  yScaleLeft: PositionScale | null;
  yScaleRight: PositionScale | null;
  innerWidth: number;
}

interface XScale {
  lineAccessor: XYAccessor;
}

interface Value {
  datum: SeriesDatum;
  flipped?: boolean;
  hidden?: boolean;
}

export default function Values({
  series,
  formatter,
  valueProps,
  xScale,
  yScaleLeft,
  yScaleRight,
  innerWidth,
}: ValuesProps) {
  return (
    <>
      {series.map(serie => {
        const { values } = getValues(serie);
        const valueStep = getValueStep(
          [serie],
          formatter,
          valueProps,
          innerWidth,
        );
        const compact = getCompact(serie);

        const yScale = (
          serie.yAxisPosition === "left" ? yScaleLeft : yScaleRight
        ) as PositionScale;
        return values.map((value, index) => {
          const { xAccessor, yAccessor } = getXyAccessors(
            serie.type,
            xScale,
            yScale,
            value.flipped,
          );
          return (
            index % valueStep === 0 && (
              <Text
                key={index}
                x={xAccessor(value.datum)}
                y={yAccessor(value.datum)}
                textAnchor="middle"
                verticalAnchor="end"
                {...valueProps}
              >
                {formatter(getY(value.datum), compact)}
              </Text>
            )
          );
        });
      })}
    </>
  );

  function getValues(s: HydratedSeries) {
    const values = getSeriesTransformer(s.type)(
      s.data.map(datum => {
        return {
          datum,
        };
      }),
    );

    return { values };
  }

  function getCompact(s: HydratedSeries) {
    // Use the same logic as in https://github.com/metabase/metabase/blob/1276595f073883853fed219ac185d0293ced01b8/frontend/src/metabase/visualizations/lib/chart_values.js#L178-L179
    const getAvgLength = (compact: boolean) => {
      const lengths = s.data.map(
        ([_, yValue]) => formatter(yValue, compact).length,
      );
      return lengths.reduce((sum, l) => sum + l, 0) / lengths.length;
    };
    const compact = getAvgLength(true) < getAvgLength(false) - 3;
    return compact;
  }
}

function getXyAccessors(
  type: VisualizationType,
  xScale: XScale,
  yScale: PositionScale,
  flipped?: boolean,
): {
  xAccessor: XYAccessor;
  yAccessor: XYAccessor;
} {
  return {
    xAccessor: xScale.lineAccessor,
    yAccessor: datum =>
      (yScale(getY(datum)) ?? 0) +
      (flipped ? FLIPPED_VALUES_MARGIN : -VALUES_MARGIN),
  };
}

function getSeriesTransformer(
  type: VisualizationType,
): <T extends Value>(values: T[]) => Value[] {
  if (type === "line") {
    return values =>
      values.map((value, index) => {
        // Use the similar logic as presented in https://github.com/metabase/metabase/blob/3f4ca9c70bd263a7579613971ea8d7c47b1f776e/frontend/src/metabase/visualizations/lib/chart_values.js#L130
        const previousValue = values[index - 1];
        const nextValue = values[index + 1];
        const showLabelBelow =
          // first point or prior is greater than y
          (index === 0 || getY(previousValue.datum) > getY(value.datum)) &&
          // last point point or next is greater than y
          (index >= values.length - 1 ||
            getY(nextValue.datum) > getY(value.datum));

        return {
          ...value,
          flipped: showLabelBelow,
        };
      });
  }

  return values => values;
}
