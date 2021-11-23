import React from 'react'
import { Group } from '@visx/group';
import { PositionScale } from '@visx/shape/lib/types';
import { LineArea } from 'metabase/static-viz/components/XYChart/shapes/LineArea';
import { Series, SeriesDatum } from 'metabase/static-viz/components/XYChart/types';
import { getY } from 'metabase/static-viz/components/XYChart/utils';

interface AreaSeriesProps {
  series: Series[];
  yScaleLeft: PositionScale | null;
  yScaleRight: PositionScale | null;
  xAccessor: (datum: SeriesDatum) => number
}

export const AreaSeries = ({ series, yScaleLeft, yScaleRight, xAccessor }: AreaSeriesProps) => {
  return (
    <Group>
      {series.map(s => {
        const yScale = s.yAxisPosition === 'left' ? yScaleLeft! : yScaleRight!

        return (
        <LineArea
          key={s.name}
          yScale={yScale}
          color={s.color}
          data={s.data}
          x={xAccessor as any}
          y={d => yScale(getY(d as any)) ?? 0 }
          y1={yScale(0) ?? 0}
        />
      )})}
    </Group>
  );
};
