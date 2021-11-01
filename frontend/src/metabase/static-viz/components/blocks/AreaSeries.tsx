import React from 'react'

import type { ScaleBand } from "d3-scale";
import { Datum, Series } from "./types";
import { Group } from '@visx/group';
import { Area } from './Area';
import { getX, getY } from './utils/scale';
import { PositionScale } from '@visx/shape/lib/types';

interface AreaSeriesProps {
  series: Series<Date, number>[];
  xScale: ScaleBand<number>;
  yScale: PositionScale;
}

export const AreaSeries = ({ series, xScale, yScale }: AreaSeriesProps) => {
  return (
    <Group>
      {series.map(s => (
        <Area
          key={s.label}
          yScale={yScale}
          color={s.settings.color}
          data={s.data}
          x={d => xScale(getX(d as Datum<Date, number>).valueOf()) ?? 0 + xScale.bandwidth() / 2}
          y={d => yScale(getY(d as Datum<Date, number>)) ?? 0}
        />
      ))}
    </Group>
  );
};
