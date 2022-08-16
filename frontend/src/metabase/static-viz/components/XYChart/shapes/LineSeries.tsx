import React from "react";
import { Group } from "@visx/group";
import { LinePath } from "@visx/shape";
import { PositionScale } from "@visx/shape/lib/types";
import { getY } from "metabase/static-viz/components/XYChart/utils";
import { Text } from "@visx/text";

import type {
  Series,
  SeriesDatum,
} from "metabase/static-viz/components/XYChart/types";
import type { TextProps } from "@visx/text";

const VALUES_MARGIN = 6;

interface LineSeriesProps {
  series: Series[];
  yScaleLeft: PositionScale | null;
  yScaleRight: PositionScale | null;
  xAccessor: (datum: SeriesDatum) => number;
  showValues: boolean;
  valueFormatter: (value: number) => string;
  valueProps: Partial<TextProps>;
}

export const LineSeries = ({
  series,
  yScaleLeft,
  yScaleRight,
  xAccessor,
  showValues,
  valueFormatter,
  valueProps,
}: LineSeriesProps) => {
  return (
    <Group>
      {series.map(s => {
        const yScale = s.yAxisPosition === "left" ? yScaleLeft : yScaleRight;
        if (!yScale) {
          return null;
        }

        const yAccessor = (datum: SeriesDatum) => yScale(getY(datum)) ?? 0;
        return (
          <>
            <LinePath
              key={s.name}
              data={s.data}
              x={xAccessor}
              y={yAccessor}
              stroke={s.color}
              strokeWidth={2}
            />
            {showValues &&
              s.data.map((datum, index) => {
                // Use the similar logic as presented in https://github.com/metabase/metabase/blob/3f4ca9c70bd263a7579613971ea8d7c47b1f776e/frontend/src/metabase/visualizations/lib/chart_values.js#L130
                const showLabelBelow =
                  // first point or prior is greater than y
                  (index === 0 || getY(s.data[index - 1]) > getY(datum)) &&
                  // last point point or next is greater than y
                  (index >= s.data.length - 1 ||
                    getY(s.data[index + 1]) > getY(datum));
                return (
                  <Value
                    key={index}
                    x={xAccessor(datum)}
                    y={yAccessor(datum)}
                    valueProps={valueProps}
                    showLabelBelow={showLabelBelow}
                  >
                    {valueFormatter(getY(datum))}
                  </Value>
                );
              })}
          </>
        );
      })}
    </Group>
  );
};

interface ValueProps {
  x: number;
  y: number;
  valueProps: Partial<TextProps>;
  children: string;
  showLabelBelow: boolean;
}

function Value({ x, y, valueProps, children, showLabelBelow }: ValueProps) {
  return (
    <Text
      x={x}
      y={showLabelBelow ? y + VALUES_MARGIN : y - VALUES_MARGIN}
      textAnchor="middle"
      verticalAnchor={showLabelBelow ? "start" : "end"}
      {...valueProps}
    >
      {children}
    </Text>
  );
}
