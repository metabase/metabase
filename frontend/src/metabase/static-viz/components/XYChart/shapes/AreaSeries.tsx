import React from 'react'

import type { ScaleBand } from "d3-scale";
import { Group } from '@visx/group';
import { LineArea } from './LineArea';
import { PositionScale } from '@visx/shape/lib/types';
import { Series } from '../types';
import { getX, getY } from '../utils';

interface AreaSeriesProps {
  series: Series[];
  xScale: ScaleBand<number | string>;
  yScaleLeft: PositionScale | null;
  yScaleRight: PositionScale | null;
}

export const AreaSeries = ({ series, xScale, yScaleLeft, yScaleRight }: AreaSeriesProps) => {
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
          x={d => (xScale(getX(d as any)) ?? 0) + xScale.bandwidth() / 2}
          y={d => yScale(getY(d as any)) ?? 0 }
          y1={yScale(0) ?? 0}
        />
      )})}
    </Group>
  );
};
