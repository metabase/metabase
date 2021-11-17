import React from 'react'

import type { ScaleBand } from "d3-scale";
import { Group } from '@visx/group';
import { Area } from './Area';
import { PositionScale } from '@visx/shape/lib/types';
import { Series } from '../types';
import { getX, getY } from '../utils';

interface AreaSeriesProps {
  series: Series[];
  xScale: ScaleBand<number | string>;
  yScale: PositionScale;
}

export const AreaSeries = ({ series, xScale, yScale }: AreaSeriesProps) => {
  return (
    <Group>
      {series.map(s => (
        <Area
          key={s.name}
          yScale={yScale}
          color={s.color}
          data={s.data}
          x={d => (xScale(getX(d as any)) ?? 0) + xScale.bandwidth() / 2}
          y={d => yScale(getY(d as any)) ?? 0 }
        />
      ))}
    </Group>
  );
};
